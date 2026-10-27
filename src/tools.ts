import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, isAbsolute, resolve, dirname, relative, basename } from "node:path";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync, renameSync, copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tool } from "ai";
import { z } from "zod";
import { computeEmbeddings } from "./embeddings.ts";

function safeBackup(projectDir: string, filePath: string) {
  try {
    if (!existsSync(filePath)) return;
    const rel = relative(projectDir, filePath);
    const backupDir = join(projectDir, ".klodex", "backups", dirname(rel));
    mkdirSync(backupDir, { recursive: true });
    const backupPath = join(backupDir, `${basename(filePath)}.${Date.now()}.bak`);
    copyFileSync(filePath, backupPath);
  } catch {}
}

function atomicWrite(filePath: string, content: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, content, "utf8");
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

export type ToolCtx = { projectDir: string; signal?: AbortSignal; readOnly?: boolean };

export function resolvePath(ctx: ToolCtx, input?: string, fallback?: string): string {
  let p = input ?? fallback ?? ctx.projectDir;
  p = p.trim();
  if (!p) p = ctx.projectDir;
  if (p === "~") p = homedir();
  else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  else if (!isAbsolute(p)) p = join(ctx.projectDir, p);
  return resolve(p);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.7));
  const tail = text.slice(-Math.floor(max * 0.2));
  return `${head}\n\n... [truncated ${text.length - max} chars, middle omitted] ...\n\n${tail}`;
}

const MAX_LINE = 2000;
const MAX_LINES = 2000;
const MAX_BASH = 30_000;

export function resolveShellCommand(command: string): { cmd: string[]; shellName: string } {
  if (process.platform === "win32") {
    const psCommand = `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); ${command}`;
    return {
      cmd: [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        psCommand,
      ],
      shellName: "PowerShell",
    };
  }

  const defaultUnix = process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
  const shell = process.env.SHELL?.trim() || defaultUnix;
  return {
    cmd: [shell, "-lc", command],
    shellName: shell,
  };
}

export function buildTools(ctx: ToolCtx, extraTools?: any) {
  const bash = tool({
    description:
      "Run a shell command in the project directory and return stdout+stderr. " +
      `Good for git, builds, tests, package managers. Runs via ${process.platform === "win32" ? "PowerShell" : "zsh/bash"}; state does not persist between calls.`,
    inputSchema: z.object({
      command: z.string().min(1),
      timeout_seconds: z.number().int().max(300).optional().describe("Default 120, max 300"),
    }),
    execute: async ({ command, timeout_seconds }) => {
      ctx.signal?.throwIfAborted();
      if (ctx.readOnly) throw new Error("Shell execution is unavailable for read-only agents");
      const timeout = Math.min(300, Math.max(5, timeout_seconds ?? 120)) * 1000;
      try {
        const { cmd } = resolveShellCommand(command);
        const proc = Bun.spawn(cmd, {
          cwd: ctx.projectDir,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: process.env,
          detached: process.platform !== "win32",
        });
        let stdout = "";
        let stderr = "";
        const stop = () => {
          try {
            if (process.platform === "win32") Bun.spawn(["taskkill", "/PID", String(proc.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
            else process.kill(-proc.pid, "SIGKILL");
          } catch { try { proc.kill(); } catch {} }
        };
        const timer = setTimeout(stop, timeout);
        ctx.signal?.addEventListener("abort", stop, { once: true });
        if (ctx.signal?.aborted) stop();
        const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
        try {
          await proc.exited;
        } finally {
          clearTimeout(timer);
          ctx.signal?.removeEventListener("abort", stop);
        }
        stdout = out;
        stderr = err;
        const code = proc.exitCode ?? 0;
        const timedOut = code === null || code === undefined || code === 143 || code === 137;
        let result = "";
        if (timedOut) result += `Command timed out after ${timeout / 1000}s and was killed.\n`;
        if (code !== 0 && !timedOut) result += `Exit code: ${code}\n`;
        const combined = (stdout ? stdout : "(no stdout)") + (stderr ? `\nstderr:\n${stderr}` : "");
        result += truncate(combined, MAX_BASH);
        return truncate(result, MAX_BASH);
      } catch (e: any) {
        return `ERROR: failed to run command: ${e?.message ?? String(e)}`;
      }
    },
  });

  const read = tool({
    description:
      "Read a text file with 1-based line numbers. Use offset/limit for large files (default limit 2000 lines). " +
      "Directories are listed instead. Images/PDFs are not supported.",
    inputSchema: z.object({
      path: z.string().describe("File path, absolute or relative to the project directory"),
      offset: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
    }),
    execute: async ({ path, offset, limit }) => {
      try {
        const p = resolvePath(ctx, path);
        const st = statSync(p);
        if (st.isDirectory()) {
          const names = readdirSync(p, { withFileTypes: true })
            .slice(0, 1000)
            .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
            .join("\n");
          return truncate(`${p}/\n${names}`, MAX_BASH);
        }
        const text = readFileSync(p, "utf8");
        const lines = text.split("\n");
        const start = (offset ?? 1) - 1;
        const end = Math.min(lines.length, start + (limit ?? MAX_LINES));
        const shown = lines.slice(start, end).map((l, i) => {
          const lineNo = start + i + 1;
          const cut = l.length > MAX_LINE ? l.slice(0, MAX_LINE) + " …[line truncated]" : l;
          return `${String(lineNo).padStart(6)}: ${cut}`;
        });
        const more = end < lines.length ? `\n… (${lines.length - end} more lines, use offset=${end + 1})` : "";
        return truncate(shown.join("\n") + more, MAX_BASH);
      } catch (e: any) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    },
  });

  const write = tool({
    description:
      "Create or overwrite a file with the given content. Parent directories are created automatically. " +
      "For partial changes prefer the edit tool to preserve surrounding code.",
    inputSchema: z.object({
      path: z.string().describe("File path, absolute or relative to the project directory"),
      content: z.string(),
    }),
    execute: async ({ path, content }) => {
      ctx.signal?.throwIfAborted();
      if (ctx.readOnly) throw new Error("Read-only agent cannot write files");
      try {
        const p = resolvePath(ctx, path);
        const existed = existsSync(p);
        if (existed) {
          safeBackup(ctx.projectDir, p);
        }
        atomicWrite(p, content);
        return `${existed ? "Overwrote" : "Wrote"} ${p} (${Buffer.byteLength(content)} bytes)`;
      } catch (e: any) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    },
  });

  const edit = tool({
    description:
      "Replace an exact unique string in an existing file (keeps surrounding code untouched). " +
      "Read the file first to get the exact text including whitespace. Fails unless the string occurs exactly once; " +
      "pass replace_all=true for an intentional global replace.",
    inputSchema: z.object({
      path: z.string().describe("File path, absolute or relative to the project directory"),
      old_string: z.string().min(1),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    }),
    execute: async ({ path, old_string, new_string, replace_all }) => {
      ctx.signal?.throwIfAborted();
      if (ctx.readOnly) throw new Error("Read-only agent cannot edit files");
      try {
        const p = resolvePath(ctx, path);
        if (!existsSync(p)) return `ERROR: file not found: ${p}`;
        const rawText = readFileSync(p, "utf8");
        const isCrlf = rawText.includes("\r\n");

        // Normalize both target and search strings to LF for matching
        const normText = rawText.replace(/\r\n/g, "\n");
        const normOld = old_string.replace(/\r\n/g, "\n");
        const normNew = new_string.replace(/\r\n/g, "\n");

        const count = normText.split(normOld).length - 1;
        if (count === 0) {
          const lines = normText.split("\n");
          const firstLine = normalize(normOld).split("\n")[0] ?? "";
          const hint = lines
            .map((l, i) => ({ l, i }))
            .filter(({ l }) => (firstLine ? normalize(l).includes(firstLine.slice(0, 40)) : false))
            .slice(0, 3);
          const hintLines = hint.slice(0, 3).map(({ i }) => i + 1);
          return `ERROR: old_string not found in ${p}${hintLines.length ? `; similar text near lines ${hintLines.join(",")}` : ""} — read the file again and copy the exact text`;
        }
        if (count > 1 && !replace_all) {
          return `ERROR: old_string matches ${count} places in ${p}; add more surrounding context so it is unique, or set replace_all=true`;
        }
        const replaced = replace_all ? normText.replaceAll(normOld, normNew) : normText.replace(normOld, normNew);
        const finalContent = isCrlf ? replaced.replace(/\n/g, "\r\n") : replaced;

        safeBackup(ctx.projectDir, p);
        atomicWrite(p, finalContent);
        return `Edited ${p} (${count} ${count > 1 ? "replacements" : "replacement"})`;
      } catch (e: any) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    },
  });

  const glob = tool({
    description: "Find files matching a glob pattern (e.g. 'src/**/*.ts'). Returns up to 1000 paths.",
    inputSchema: z.object({
      pattern: z.string().min(1),
      path: z.string().optional().describe("Directory to search; defaults to the project directory"),
    }),
    execute: async ({ pattern, path }) => {
      try {
        const cwd = resolvePath(ctx, path);
        const globber = new Bun.Glob(pattern);
        const files: string[] = [];
        for await (const f of globber.scan({ cwd, dot: true, onlyFiles: true })) {
          files.push(f);
          if (files.length >= 1000) break;
        }
        if (!files.length) return "No files matched.";
        const rel = (p: string) => {
          const r = relative(ctx.projectDir, join(cwd, p));
          return r.startsWith("..") ? join(cwd, p) : r;
        };
        return truncate(files.sort().map(rel).join("\n"), MAX_BASH);
      } catch (e: any) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    },
  });

  const grep = tool({
    description:
      "Search file contents with ripgrep. Up to 200 matches with file:line previews.",
    inputSchema: z.object({
      pattern: z.string().min(1).describe("Regular expression (Rust syntax), or plain text if literal=true"),
      path: z.string().optional().describe("File or directory to search; defaults to the project directory"),
      include: z.string().optional().describe("Glob filter for file names, e.g. '*.ts'"),
      literal: z.boolean().optional(),
    }),
    execute: async ({ pattern, path, include, literal }) => {
      try {
        const target = resolvePath(ctx, path);
        if (!existsSync(target)) return `ERROR: path not found: ${target}`;
        const args = [
          "rg",
          "-n",
          "--no-heading",
          "--no-messages",
          "-S",
          "-m",
          "200",
          ...(literal ? ["-F"] : []),
          ...(include ? ["-g", include] : []),
          "--",
          pattern,
          target,
        ];
        let out = "";
        let code = 0;
        try {
          out = execFileSync("rg", args.slice(1), { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
        } catch (e: any) {
          // rg exits 1 for "no matches"; anything else is a real failure
          out = e.stdout ?? "";
          code = e.status ?? -1;
        }
        if (code !== 0 && code !== 1 && !out) return "rg failed (is ripgrep installed?)";
        if (!out.trim()) return "No matches.";
        const lines = out.split("\n");
        const shown = lines.slice(0, 200).map((l) => {
          const m = /^((?:[a-zA-Z]:[\\/])?[^:\r\n]+):(\d+):(.*)$/.exec(l);
          if (!m || !m[1]) return l;
          const r = relative(ctx.projectDir, m[1]);
          const file = r.startsWith("..") ? m[1] : r;
          return `${file}:${m[2]}:${m[3]}`;
        });
        const more = lines.length > 200 ? `\n… ${lines.length - 200} more lines` : "";
        return truncate(shown.join("\n") + more, MAX_BASH);
      } catch (e: any) {
        return `ERROR: ${e?.message ?? String(e)}`;
      }
    },
  });

  const generate_image = tool({
    description:
      "Generate an image via Pollinations.ai FLUX (free, keyless REST API). " +
      "Downloads and saves a high-quality JPEG binary to output_path.",
    inputSchema: z.object({
      prompt: z.string().describe("Descriptive image prompt in English"),
      output_path: z.string().describe("Path to save the generated image, e.g. 'public/hero.jpg' or 'banner.jpg'"),
      width: z.number().int().optional().default(1024),
      height: z.number().int().optional().default(1024),
      model: z.enum(["flux", "turbo"]).optional().default("flux"),
    }),
    execute: async ({ prompt, output_path, width, height, model }) => {
      try {
        const p = resolvePath(ctx, output_path);
        mkdirSync(dirname(p), { recursive: true });
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&nologo=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!res.ok) return `ERROR: Pollinations image API returned HTTP ${res.status}`;
        const buf = await res.arrayBuffer();
        writeFileSync(p, Buffer.from(buf));
        return `Successfully generated image and saved to ${p} (${buf.byteLength} bytes)`;
      } catch (e: any) {
        return `ERROR: Failed to generate image: ${e?.message ?? String(e)}`;
      }
    },
  });

  const embed = tool({
    description:
      "Compute dense vector embeddings locally using fastembed ONNX (BAAI/bge-small-en-v1.5, 384 dimensions). " +
      "Runs 100% locally on CPU without API keys. Ideal for vector search and semantic similarity.",
    inputSchema: z.object({
      texts: z.array(z.string()).min(1).describe("List of strings to embed"),
    }),
    execute: async ({ texts }) => {
      try {
        const result = await computeEmbeddings(texts);
        return JSON.stringify({
          ok: true,
          model: "BAAI/bge-small-en-v1.5",
          dim: result.dim,
          count: result.vectors.length,
          vectors: result.vectors,
        });
      } catch (e: any) {
        return `ERROR: Embedding computation failed: ${e?.message ?? String(e)}`;
      }
    },
  });

  const extras = extraTools?.inputSchema ? { subagent: extraTools } : (extraTools ?? {});
  return { bash, read, write, edit, glob, grep, generate_image, embed, ...extras };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
