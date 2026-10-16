import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
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

function isNewerVersion(current: string, target: string): boolean {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  const [tMaj = 0, tMin = 0, tPat = 0] = parse(target);
  if (tMaj > cMaj) return true;
  if (tMaj === cMaj && tMin > cMin) return true;
  if (tMaj === cMaj && tMin === cMin && tPat > cPat) return true;
  return false;
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

  // 2. HTTP Fallback / Remote release check (works with or without Git)
  if (!hasUpdate && repoName) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.github.com/repos/${repoName}/releases/latest`, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Klodex-Updater",
          Accept: "application/vnd.github.v3+json",
        },
      });
      clearTimeout(t);

      if (res.ok) {
        const data = (await res.json()) as { tag_name?: string; body?: string; html_url?: string };
        const tagName = (data.tag_name ?? "").replace(/^v/, "");
        if (tagName && isNewerVersion(currentVersion, tagName)) {
          hasUpdate = true;
          updateType = "release";
          latestVersion = data.tag_name;
          releaseNotes = data.body;
          releaseUrl = data.html_url;
          message = `Доступна новая версия ${data.tag_name}`;
        }
      }
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
    const bunInst = await runCmd("bun install", process.cwd(), 45000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiBuild = await runCmd("cd web-ui && bun install && bun run build", process.cwd(), 60000);
    logs.push(uiBuild.stdout || uiBuild.stderr);

    if (!uiBuild.ok) {
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Сборка UI завершилась с ошибкой.",
      };
    }

    cachedStatus = null;
    lastCheckTime = 0;

    return {
      ok: true,
      log: logs.join("\n"),
      message: "Klodex успешно обновлён через Git! Перезапустите сервер или обновите страницу.",
    };
  }

  // Path B: User does NOT have Git (or downloaded zip without .git folder)
  // We download the source tarball directly via HTTP and extract it in-place using system tar
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
    const tempFile = join(tmpdir(), `klodex-update-${Date.now()}.tar.gz`);
    writeFileSync(tempFile, Buffer.from(arrayBuffer));
    logs.push(`Архив сохранён (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} МБ). Распаковка...`);

    // Extract tar.gz into current directory, skipping top-level folder
    const extractRes = await runCmd(`tar -xzf "${tempFile}" --strip-components=1 -C "${process.cwd()}"`);
    try {
      rmSync(tempFile, { force: true });
    } catch {}

    if (!extractRes.ok) {
      logs.push(extractRes.stderr || extractRes.stdout);
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Ошибка распаковки архива обновления.",
      };
    }

    logs.push("[3/3] Установка зависимостей и сборка веб-интерфейса...");
    const bunInst = await runCmd("bun install", process.cwd(), 45000);
    logs.push(bunInst.stdout || bunInst.stderr);

    const uiBuild = await runCmd("cd web-ui && bun install && bun run build", process.cwd(), 60000);
    logs.push(uiBuild.stdout || uiBuild.stderr);

    if (!uiBuild.ok) {
      return {
        ok: false,
        log: logs.join("\n"),
        message: "Сборка UI после обновления завершилась с ошибкой.",
      };
    }

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
