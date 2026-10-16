import { execFileSync } from "node:child_process";

/**
 * Windows-only helpers.
 *
 * On Windows PATH lives in the registry and is only injected into *new* processes.
 * If Git (or Bun, or anything else) was installed after this process (or the shell
 * that started it) was spawned, we simply cannot see it in process.env.PATH — even
 * though `where git` works fine in a freshly opened terminal.
 *
 * These helpers re-read the registry PATH and merge the missing entries into the
 * current process env, so both the updater (`git --version`) and the bash tool
 * (PowerShell, inherited env) can find freshly installed binaries.
 */

let refreshed = false;

export function pathSeparator(): string {
  return process.platform === "win32" ? ";" : ":";
}

function normalizeEntry(entry: string): string {
  return entry.trim().replace(/[\\/]+$/, "");
}

/** Expand %VAR% placeholders (registry PATH is often stored unexpanded). */
function expandWinVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (_match, name: string) => {
    return process.env[name] ?? process.env[name.toUpperCase()] ?? process.env[name.toLowerCase()] ?? "";
  });
}

/** Append a directory to PATH of the current process if it is not there yet. */
export function ensurePathEntry(dir: string): void {
  const target = normalizeEntry(dir);
  if (!target) return;

  const sep = pathSeparator();
  const current = (process.env.PATH ?? "")
    .split(sep)
    .map(normalizeEntry)
    .filter(Boolean);

  const known = new Set(current.map((entry) => entry.toLowerCase()));
  if (known.has(target.toLowerCase())) return;

  process.env.PATH = [...current, target].join(sep);
}

/**
 * Merge Machine + User PATH from the registry into process.env.PATH (win32 only).
 * Idempotent: the PowerShell roundtrip happens at most once per process.
 */
export function refreshWindowsPath(): void {
  if (process.platform !== "win32" || refreshed) return;
  refreshed = true;

  try {
    const script =
      "[Console]::Out.Write([Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'))";
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", timeout: 8000, windowsHide: true },
    );

    for (const raw of out.split(";")) {
      const entry = raw.trim();
      if (!entry) continue;
      ensurePathEntry(expandWinVars(entry));
    }
  } catch {
    // PowerShell unavailable / blocked by policy: keep whatever PATH we already have.
  }
}
