import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { loadConfig } from "./config.ts";
import { ensurePathEntry, refreshWindowsPath, persistUserPathEntry } from "./winenv.ts";

const execAsync = promisify(exec);

const execFileAsync = promisify(execFile) as unknown as (
  file: string,
  args: string[],
  options: { cwd?: string; timeout?: number; maxBuffer?: number; windowsHide?: boolean },
) => Promise<{ stdout: string; stderr: string }>;

type CmdResult = { stdout: string; stderr: string; ok: boolean; code?: string | number };

export interface UpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  updateType?: "git" | "tarball" | "release";
  commitsBehind?: number;
  releaseNotes?: string;
  releaseUrl?: string;
  isGitRepo: boolean;
  hasGitCli: boolean;
  remoteUrl?: string;
  lastChecked: number;
  message?: string;
  error?: string;
}

let cachedStatus: UpdateStatus | null = null;
let lastCheckTime = 0;
let inflight: Promise<UpdateStatus> | null = null;
let watcherTimer: ReturnType<typeof setInterval> | null = null;

export function getCurrentVersion(): string {
  try {
    const candidates = [
      join(import.meta.dir, "..", "package.json"),
      join(process.cwd(), "package.json"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const pkg = JSON.parse(readFileSync(p, "utf8")) as { name?: string; version?: string };
        if (pkg.name === "klodex" && pkg.version) return pkg.version;
        if (pkg.version) return pkg.version;
      }
    }
  } catch {}
  return "";
}

async function runCmd(cmd: string, cwd = process.cwd(), timeoutMs = 15000): Promise<CmdResult> {
  try {
    const res = await execAsync(cmd, { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    return { stdout: res.stdout.trim(), stderr: res.stderr.trim(), ok: true };
  } catch (err: any) {
    return { stdout: "", stderr: err.message ?? String(err), ok: false, code: err?.code };
  }
}

/**
 * Run an executable directly, without a shell.
 * This is what makes commands portable: `exec` on Windows goes through cmd.exe,
 * where POSIX idioms (`2>/dev/null`, `||` chains with redirects) silently break.
 */
async function runExe(exe: string, args: string[], cwd = process.cwd(), timeoutMs = 15000): Promise<CmdResult> {
  try {
    const res = await execFileAsync(exe, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: String(res.stdout).trim(), stderr: String(res.stderr).trim(), ok: true };
  } catch (err: any) {
    return { stdout: "", stderr: err?.message ?? String(err), ok: false, code: err?.code };
  }
}

/** Well-known Git for Windows install locations (installer may skip "Add to PATH"). */
function windowsGitCandidates(): string[] {
  const out: string[] = [];
  const add = (p: string | undefined) => {
    if (p && existsSync(p) && !out.includes(p)) out.push(p);
  };

  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || "";
  const home = process.env.USERPROFILE || process.env.HOME || "";

  add(join(programFiles, "Git", "cmd", "git.exe"));
  add(join(programFiles, "Git", "bin", "git.exe"));
  add(join(programFilesX86, "Git", "cmd", "git.exe"));
  add(join(programFilesX86, "Git", "bin", "git.exe"));
  if (localAppData) {
    add(join(localAppData, "Programs", "Git", "cmd", "git.exe"));
    add(join(localAppData, "Git", "cmd", "git.exe"));
  }
  if (home) {
    add(join(home, "scoop", "shims", "git.exe"));
    add(join(home, "AppData", "Local", "Programs", "Git", "cmd", "git.exe"));
  }

  return out;
}

let gitPathCache: string | null | undefined;

/**
 * Resolve the git executable once per process.
 * Order: KLODEX_GIT override -> `git` from PATH -> standard Windows install paths.
 * Never searches the registry for an install; on Windows it does re-read PATH
 * from the registry, because our own PATH may predate the Git installation.
 */
export async function resolveGitPath(): Promise<string | null> {
  if (gitPathCache !== undefined) return gitPathCache;

  if (process.platform === "win32") refreshWindowsPath();

  const candidates: string[] = [];
  const envGit = process.env.KLODEX_GIT?.trim();
  if (envGit) candidates.push(envGit);
  candidates.push("git");
  if (process.platform === "win32") candidates.push(...windowsGitCandidates());

  for (const candidate of candidates) {
    if (!candidate) continue;
    const res = await runExe(candidate, ["--version"], process.cwd(), 8000);
    if (!res.ok) continue;

    gitPathCache = candidate;
    // Found outside PATH: expose to this process and persist to User PATH registry
    if (candidate !== "git") {
      const gitDir = dirname(candidate);
      ensurePathEntry(gitDir);
      persistUserPathEntry(gitDir);
    }
    return candidate;
  }

  gitPathCache = null;
  return null;
}

async function runGit(args: string[], cwd = process.cwd(), timeoutMs = 15000): Promise<CmdResult> {
  const git = await resolveGitPath();
  if (!git) return { stdout: "", stderr: "git executable not found", ok: false };
  return runExe(git, args, cwd, timeoutMs);
}

/** Bun is usually started by absolute path from the launcher, so it may be missing from PATH. */
async function runBun(args: string[], cwd = process.cwd(), timeoutMs = 60000): Promise<CmdResult> {
  const exe = process.env.KLODEX_BUN?.trim() || process.execPath;
  if (exe && /(^|[\\/])bun(\.exe)?$/i.test(exe)) {
    const res = await runExe(exe, args, cwd, timeoutMs);
    if (res.ok || res.code !== "ENOENT") return res;
  }
  return runCmd(`bun ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`, cwd, timeoutMs);
}

async function checkGitCli(): Promise<boolean> {
  return (await resolveGitPath()) !== null;
}

export function getCurrentCommit(): string {
  try {
    const commitFile = join(process.cwd(), ".klodex_commit");
    if (existsSync(commitFile)) {
      const c = readFileSync(commitFile, "utf8").trim();
      if (c) return c;
    }
  } catch {}

  try {
    const gitHead = join(process.cwd(), ".git", "HEAD");
    if (existsSync(gitHead)) {
      const headContent = readFileSync(gitHead, "utf8").trim();
      if (headContent.startsWith("ref: ")) {
        const refPath = join(process.cwd(), ".git", headContent.slice(5).trim());
        if (existsSync(refPath)) {
          return readFileSync(refPath, "utf8").trim();
        }
      } else if (headContent.length >= 7) {
        return headContent;
      }
    }
  } catch {}

  return "";
}

export function extractTarArchive(tarBuf: Buffer, targetDir: string) {
  let offset = 0;
  let nextLongName: string | null = null;

  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    let name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeOctal = header.subarray(124, 136).toString("utf8").trim().replace(/\0.*$/, "");
    const size = parseInt(sizeOctal, 8) || 0;
    const type = String.fromCharCode(header[156] ?? 0);
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    if (prefix) name = `${prefix}/${name}`;

    offset += 512;
    const data = tarBuf.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (type === "L") {
      nextLongName = data.toString("utf8").replace(/\0.*$/, "");
      continue;
    }
    if (nextLongName) {
      name = nextLongName;
      nextLongName = null;
    }

    const slashIdx = name.indexOf("/");
    if (slashIdx === -1) continue;
    const relPath = name.slice(slashIdx + 1);
    if (!relPath) continue;

    const fullPath = join(targetDir, relPath);
    if (type === "5" || name.endsWith("/")) {
      mkdirSync(fullPath, { recursive: true });
    } else {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, data);
    }
  }
}


/**
 * Public entry point: serves the 60s cache, collapses concurrent background checks
 * (watcher + UI polls) into a single network round-trip, then delegates to
 * performUpdateCheck(). `force` always runs a fresh check and never joins the cache.
 */
export async function checkUpdates(force = false): Promise<UpdateStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - lastCheckTime < 60000) {
    return cachedStatus;
  }
  if (!force && inflight) return inflight;

  const promise = performUpdateCheck(now);
  if (!force) {
    inflight = promise;
    void promise.catch(() => {}).finally(() => {
      if (inflight === promise) inflight = null;
    });
  }
  return promise;
}

async function performUpdateCheck(now: number): Promise<UpdateStatus> {
  const currentVersion = getCurrentVersion();
  const cfg = loadConfig();
  const repoName = cfg.updateRepo ?? "lonestill/klodex";

  const hasGit = await checkGitCli();
  let isGitRepo = false;
  let remoteUrl: string | undefined;
  let commitsBehind = 0;
  let hasUpdate = false;
  let updateType: "git" | "tarball" | "release" | undefined;
  let latestVersion: string | undefined = currentVersion;
  let releaseNotes: string | undefined;
  let releaseUrl: string | undefined;
  let message: string | undefined = "У вас установлена актуальная версия";

  // 1. Try Git if installed
  if (hasGit) {
    const gitCheck = await runGit(["rev-parse", "--is-inside-work-tree"]);
    if (gitCheck.ok && gitCheck.stdout === "true") {
      isGitRepo = true;
      const remoteCheck = await runGit(["remote", "get-url", "origin"]);
      if (remoteCheck.ok && remoteCheck.stdout) {
        remoteUrl = remoteCheck.stdout;

        const fetchRes = await runGit(["fetch", "origin", "--quiet"], process.cwd(), 10000);
        if (fetchRes.ok) {
          // Pick the first existing upstream ref instead of an `||` shell chain
          // (redirects + `||` do not survive cmd.exe on Windows).
          let ref: string | undefined;
          let count = 0;
          for (const candidate of ["origin/HEAD", "origin/main", "origin/master"]) {
            const revCheck = await runGit(["rev-list", `HEAD..${candidate}`, "--count"]);
            if (!revCheck.ok) continue;
            const parsed = parseInt(revCheck.stdout, 10);
            if (isNaN(parsed)) continue;
            ref = candidate;
            count = parsed;
            break;
          }
          if (ref && count > 0) {
            hasUpdate = true;
            commitsBehind = count;
            updateType = "git";
            const lastLog = await runGit(["log", "-1", "--pretty=format:%h - %s", ref]);
            if (lastLog.ok && lastLog.stdout) {
              releaseNotes = `Новые коммиты (${count} шт.):\n${lastLog.stdout}`;
              latestVersion = lastLog.stdout.split(" - ")[0];
            }
            message = `Доступно обновление: ${count} новых коммитов в origin`;
          }
        }
      }
    }
  }

  // 2. HTTP Fallback / Remote commits & release check (works with or without Git)
  if (!hasUpdate && repoName) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 7000);

      // Check latest commit on main branch
      const commitRes = await fetch(`https://api.github.com/repos/${repoName}/commits/main`, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Klodex-Updater",
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (commitRes.ok) {
        const commitData = (await commitRes.json()) as {
          sha?: string;
          commit?: { message?: string; author?: { date?: string } };
        };
        const remoteSha = commitData.sha;
        const localSha = getCurrentCommit();

        if (remoteSha && (!localSha || !remoteSha.startsWith(localSha))) {
          hasUpdate = true;
          updateType = "tarball";
          latestVersion = remoteSha.slice(0, 7);
          const firstLine = ((commitData.commit?.message ?? "").split("\n")[0] ?? "").trim();
          releaseNotes = `Свежий коммит из main (${remoteSha.slice(0, 7)}):\n${commitData.commit?.message ?? ""}`;
          message = `Доступно обновление: ${remoteSha.slice(0, 7)} — ${firstLine || "новые изменения в main"}`;
        }
      } else {
        // Fallback to releases if commits endpoint fails (e.g. rate limit)
        const relRes = await fetch(`https://api.github.com/repos/${repoName}/releases/latest`, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Klodex-Updater",
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (relRes.ok) {
          const data = (await relRes.json()) as { tag_name?: string; body?: string; html_url?: string };
          const tagName = (data.tag_name ?? "").replace(/^v/, "");
          if (tagName && (currentVersion !== tagName)) {
            hasUpdate = true;
            updateType = "release";
            latestVersion = data.tag_name;
            releaseNotes = data.body;
            releaseUrl = data.html_url;
            message = `Доступна новая версия ${data.tag_name}`;
          }
        }
      }
      clearTimeout(t);
    } catch {
      // Offline / network failure: silent
    }
  }

  const result: UpdateStatus = {
    currentVersion,
    latestVersion: latestVersion ?? currentVersion,
    hasUpdate,
    updateType,
    commitsBehind: commitsBehind > 0 ? commitsBehind : undefined,
    releaseNotes,
    releaseUrl,
    isGitRepo,
    hasGitCli: hasGit,
    remoteUrl,
    lastChecked: now,
    message,
  };

  cachedStatus = result;
  lastCheckTime = now;
  return result;
}

/**
 * Background update polling: refreshes the cached status every `intervalMs`
 * (default 1 minute) so the web UI can surface a notification without having
 * to trigger the (network-heavy) check on its own. The timer is unref'd so it
 * never keeps the process alive on its own.
 */
export function startUpdateWatcher(intervalMs = 60_000): () => void {
  if (watcherTimer) return stopUpdateWatcher;
  const tick = () => {
    void checkUpdates(false).catch(() => {});
  };
  tick();
  watcherTimer = setInterval(tick, intervalMs);
  (watcherTimer as { unref?: () => void }).unref?.();
  return stopUpdateWatcher;
}

export function stopUpdateWatcher(): void {
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }
}

export async function applyUpdate(): Promise<{ ok: boolean; log: string; message: string }> {
  const status = await checkUpdates(true);
  const logs: string[] = [];

  const gitExe = await resolveGitPath();
  logs.push(
    `[1/3] Проверка окружения (текущая версия: v${status.currentVersion}, git: ${gitExe ?? "не найден"})...`,
  );

  // Path A: User has Git and is inside a git repo
  if (status.hasGitCli && status.isGitRepo) {
    // A dirty working tree used to abort the one-click update with a bare 500:
    // a plain `git pull --rebase` refuses to start at all. `--autostash` parks
    // local edits (typically a bun-install-regenerated lockfile) and replays
    // them after the rebase, so updating an installed build dir just works.
    logs.push("[2/3] Подтягивание свежих коммитов через git pull --rebase --autostash...");
    let pull = await runGit(["pull", "--rebase", "--autostash"], process.cwd(), 120000);

    // Git < 2.27 has no --autostash: stash manually, pull, then restore.
    if (!pull.ok && /unknown option|usage: git pull|unrecognized/i.test(pull.stderr)) {
      const stash = await runGit(
        ["stash", "push", "--include-untracked", "-m", "klodex-autoupdate"],
        process.cwd(),
        30000,
      );
      const stashed = stash.ok && !/No local changes to save/i.test(stash.stdout);
      if (stashed) logs.push("Локальные изменения временно отложены в stash.");
      pull = await runGit(["pull", "--rebase"], process.cwd(), 120000);
      if (pull.ok && stashed) {
        const pop = await runGit(["stash", "pop"], process.cwd(), 30000);
        logs.push(pop.ok ? "Локальные изменения восстановлены из stash." : `stash pop: ${pop.stderr}`);
      }
    }

    logs.push(pull.stdout || pull.stderr);

    if (!pull.ok) {
      logs.push("Обнаружены несохранённые или неотслеживаемые файлы. Перемещаем в stash и повторяем pull...");
      const stashAll = await runGit(
        ["stash", "push", "--include-untracked", "-m", `klodex-autoupdate-${Date.now()}`],
        process.cwd(),
        30000,
      );
      if (stashAll.ok) {
        logs.push("Неотслеживаемые и локальные файлы перемещены в stash.");
      }

      pull = await runGit(["pull", "--rebase"], process.cwd(), 120000);
      if (!pull.ok) {
        logs.push("Повторный pull не удался. Выполняем принудительную синхронизацию с origin/main...");
        await runGit(["fetch", "origin", "main"], process.cwd(), 60000);
        pull = await runGit(["reset", "--hard", "origin/main"], process.cwd(), 30000);
      }
    }

    if (!pull.ok) {
      // Name the offending files so the failure is actionable instead of a bare 500.
      const dirty = await runGit(["status", "--porcelain"], process.cwd(), 10000);
      if (dirty.ok && dirty.stdout) {
        logs.push(`Файлы, блокирующие обновление:\n${dirty.stdout}`);
      }
      const reason =
        pull.stderr
          .split("\n")
          .map((l) => l.trim())
          .find((l) => /^(error|fatal):/i.test(l)) ?? pull.stderr.split("\n")[0] ?? "";
      return {
        ok: false,
        log: logs.join("\n"),
        message: `Ошибка git pull --rebase${reason ? `: ${reason}` : ""}. Проверьте локальные изменения в папке установки.`,
      };
    }

    logs.push("[3/3] Установка зависимостей и пересборка веб-интерфейса...");
    const bunInst = await runBun(["install"], process.cwd(), 60000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiInst = await runBun(["install"], join(process.cwd(), "web-ui"), 60000);
    logs.push(uiInst.stdout || uiInst.stderr);

    const uiBuild = await runBun(["run", "build"], join(process.cwd(), "web-ui"), 90000);
    logs.push(uiBuild.stdout || uiBuild.stderr);

    if (!uiBuild.ok) {
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Сборка UI завершилась с ошибкой.",
      };
    }

    cleanWindowsLaunchers();
    cachedStatus = null;
    lastCheckTime = 0;

    return {
      ok: true,
      log: logs.join("\n"),
      message: "Klodex успешно обновлён через Git! Перезапустите сервер или обновите страницу.",
    };
  }

  // Path B: User does NOT have Git (or downloaded zip without .git folder)
  // We download the source tarball directly via HTTP and extract it in-memory via pure JS
  const cfg = loadConfig();
  const repoName = cfg.updateRepo ?? "lonestill/klodex";
  const tarUrl = `https://github.com/${repoName}/archive/refs/heads/main.tar.gz`;

  logs.push(`[2/3] Загрузка свежего архива без Git (${tarUrl})...`);

  try {
    const res = await fetch(tarUrl, {
      headers: { "User-Agent": "Klodex-Updater" },
    });

    if (!res.ok) {
      return {
        ok: false,
        log: logs.join("\n") + `\nHTTP ${res.status}: ${res.statusText}`,
        message: `Не удалось скачать архив с GitHub (${res.status}). Проверьте, опубликован ли репозиторий ${repoName}.`,
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    logs.push(`Архив скачан (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} МБ). Распаковка в память...`);

    // In-memory pure JS extraction (no external tar or git binary required!)
    const tarBuf = gunzipSync(Buffer.from(arrayBuffer));
    extractTarArchive(tarBuf, process.cwd());
    logs.push("Архив успешно распакован.");

    // Persist installed commit SHA so future checkUpdates knows current state
    if (status.latestVersion) {
      try {
        writeFileSync(join(process.cwd(), ".klodex_commit"), status.latestVersion, "utf8");
      } catch {}
    }

    logs.push("[3/3] Установка зависимостей и сборка веб-интерфейса...");
    const bunInst = await runBun(["install"], process.cwd(), 60000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiInst = await runBun(["install"], join(process.cwd(), "web-ui"), 60000);
    logs.push(uiInst.stdout || uiInst.stderr);

    const uiBuild = await runBun(["run", "build"], join(process.cwd(), "web-ui"), 90000);
    logs.push(uiBuild.stdout || uiBuild.stderr);

    if (!uiBuild.ok) {
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Сборка UI после обновления завершилась с ошибкой.",
      };
    }

    cleanWindowsLaunchers();
    cachedStatus = null;
    lastCheckTime = 0;

    return {
      ok: true,
      log: logs.join("\n"),
      message: "Klodex успешно обновлён из архива без Git! Обновите страницу в браузере.",
    };
  } catch (err: any) {
    logs.push(`Ошибка: ${err.message ?? String(err)}`);
    return {
      ok: false,
      log: logs.join("\n"),
      message: `Ошибка автообновления: ${err.message ?? String(err)}`,
    };
  }
}

function cleanWindowsLaunchers(): void {
  if (process.platform !== "win32") return;
  try {
    const userProfile = process.env.USERPROFILE || "";
    if (!userProfile) return;
    const binDir = join(userProfile, ".klodex", "bin");
    const ps1 = join(binDir, "klodex.ps1");
    if (existsSync(ps1)) {
      rmSync(ps1, { force: true });
    }
    const installDir = join(userProfile, ".klodex");
    const cmd = join(binDir, "klodex.cmd");
    const cmdContent = `@echo off\r\nwhere git >nul 2>&1\r\nif errorlevel 1 (\r\n    if exist "%ProgramFiles%\\Git\\cmd" set "PATH=%ProgramFiles%\\Git\\cmd;%PATH%"\r\n    if exist "%LOCALAPPDATA%\\Programs\\Git\\cmd" set "PATH=%LOCALAPPDATA%\\Programs\\Git\\cmd;%PATH%"\r\n    if exist "%ProgramFiles(x86)%\\Git\\cmd" set "PATH=%ProgramFiles(x86)%\\Git\\cmd;%PATH%"\r\n    if exist "%USERPROFILE%\\scoop\\shims" set "PATH=%USERPROFILE%\\scoop\\shims;%PATH%"\r\n)\r\nif exist "%USERPROFILE%\\.bun\\bin\\bun.exe" (\r\n    "%USERPROFILE%\\.bun\\bin\\bun.exe" run --cwd "${installDir}" start %*\r\n) else (\r\n    bun run --cwd "${installDir}" start %*\r\n)\r\n`;
    writeFileSync(cmd, cmdContent, "ascii");
    writeFileSync(join(binDir, "klodex.bat"), cmdContent, "ascii");
  } catch {}
}
