import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { loadConfig } from "./config.ts";

const execAsync = promisify(exec);

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

export function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.1.1";
  } catch {
    return "0.1.1";
  }
}

async function runCmd(cmd: string, cwd = process.cwd(), timeoutMs = 15000): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const res = await execAsync(cmd, { cwd, timeout: timeoutMs });
    return { stdout: res.stdout.trim(), stderr: res.stderr.trim(), ok: true };
  } catch (err: any) {
    return { stdout: "", stderr: err.message ?? String(err), ok: false };
  }
}

async function checkGitCli(): Promise<boolean> {
  const res = await runCmd("git --version");
  return res.ok;
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


export async function checkUpdates(force = false): Promise<UpdateStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - lastCheckTime < 60000) {
    return cachedStatus;
  }

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
    const gitCheck = await runCmd("git rev-parse --is-inside-work-tree");
    if (gitCheck.ok && gitCheck.stdout === "true") {
      isGitRepo = true;
      const remoteCheck = await runCmd("git remote get-url origin");
      if (remoteCheck.ok && remoteCheck.stdout) {
        remoteUrl = remoteCheck.stdout;

        const fetchRes = await runCmd("git fetch origin --quiet", process.cwd(), 10000);
        if (fetchRes.ok) {
          const revCheck = await runCmd(
            "git rev-list HEAD..origin/HEAD --count 2>/dev/null || git rev-list HEAD..origin/main --count 2>/dev/null || git rev-list HEAD..origin/master --count 2>/dev/null"
          );
          if (revCheck.ok) {
            const count = parseInt(revCheck.stdout, 10);
            if (!isNaN(count) && count > 0) {
              hasUpdate = true;
              commitsBehind = count;
              updateType = "git";
              const lastLog = await runCmd(
                "git log -1 --pretty=format:'%h - %s' origin/HEAD 2>/dev/null || git log -1 --pretty=format:'%h - %s' origin/main 2>/dev/null"
              );
              if (lastLog.ok) {
                releaseNotes = `Новые коммиты (${count} шт.):\n${lastLog.stdout}`;
                latestVersion = lastLog.stdout.split(" - ")[0];
              }
              message = `Доступно обновление: ${count} новых коммитов в origin`;
            }
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

export async function applyUpdate(): Promise<{ ok: boolean; log: string; message: string }> {
  const status = await checkUpdates(true);
  const logs: string[] = [];

  logs.push(`[1/3] Проверка окружения (текущая версия: v${status.currentVersion}, git: ${status.hasGitCli ? "да" : "нет"})...`);

  // Path A: User has Git and is inside a git repo
  if (status.hasGitCli && status.isGitRepo) {
    logs.push("[2/3] Подтягивание свежих коммитов через git pull --rebase...");
    const pull = await runCmd("git pull --rebase", process.cwd(), 30000);
    logs.push(pull.stdout || pull.stderr);
    if (!pull.ok) {
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Ошибка git pull --rebase. Проверьте локальные несохранённые изменения.",
      };
    }

    logs.push("[3/3] Установка зависимостей и пересборка веб-интерфейса...");
    const bunInst = await runCmd("bun install", process.cwd(), 60000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiInst = await runCmd("bun install", join(process.cwd(), "web-ui"), 60000);
    logs.push(uiInst.stdout || uiInst.stderr);

    const uiBuild = await runCmd("bun run build", join(process.cwd(), "web-ui"), 90000);
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
    const bunInst = await runCmd("bun install", process.cwd(), 60000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiInst = await runCmd("bun install", join(process.cwd(), "web-ui"), 60000);
    logs.push(uiInst.stdout || uiInst.stderr);

    const uiBuild = await runCmd("bun run build", join(process.cwd(), "web-ui"), 90000);
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
    const cmdContent = `@echo off\r\nif exist "%USERPROFILE%\\.bun\\bin\\bun.exe" (\r\n    "%USERPROFILE%\\.bun\\bin\\bun.exe" run --cwd "${installDir}" start %*\r\n) else (\r\n    bun run --cwd "${installDir}" start %*\r\n)\r\n`;
    writeFileSync(cmd, cmdContent, "ascii");
    writeFileSync(join(binDir, "klodex.bat"), cmdContent, "ascii");
  } catch {}
}
