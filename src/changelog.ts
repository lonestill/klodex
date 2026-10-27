import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { checkUpdates, resolveGitPath, type UpdateStatus } from "./updater.ts";

const execFileAsync = promisify(execFile) as unknown as (
  file: string,
  args: string[],
  options: { cwd?: string; timeout?: number; maxBuffer?: number; windowsHide?: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface ChangelogSection {
  title: string;
  items: string[];
}
export interface ChangelogEntry {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}
export interface ChangelogResponse {
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  newVersions: string[];
  entries: ChangelogEntry[];
  commits: string[];
}

const BULLET = /^\s*[-*+]\s+/;
const isSemver = (version: string) => /^v?\d+(\.\d+)*$/.test(version);

/**
 * Tolerant "keep a changelog" parser: `## [1.2.0] - date` / `## 1.2.0` /
 * `## [Unreleased]`, optional `### Section` headers, bullet and prose lines.
 * Anything the maintainer wrote under a version is kept; link definitions
 * (`[1.2.0]: https://...`) are dropped.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const match = h2[1]!.match(/^\[?(Unreleased|v?\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.]+)?)\]?(?:\s*[-–—]\s*(.*))?$/i);
      current = match
        ? { version: match[1]!.replace(/^v/, ""), date: match[2]?.trim() || undefined, sections: [] }
        : null;
      section = null;
      if (current) entries.push(current);
      continue;
    }
    if (!current) continue;
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      section = { title: h3[1]!.trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    if (/^\s*\[[^\]]+\]:\s*\S/.test(line)) continue;
    const text = line.replace(BULLET, "").trim();
    if (!text) continue;
    if (!section) {
      section = { title: "", items: [] };
      current.sections.push(section);
    }
    section.items.push(text);
  }
  for (const entry of entries) entry.sections = entry.sections.filter(s => s.items.length > 0);
  return entries;
}

/** Numeric dot comparison; returns null when either side is not a plain version. */
export function compareVersions(a: string, b: string): number | null {
  const left = a.replace(/^v/, "").split(".");
  const right = b.replace(/^v/, "").split(".");
  if (![...left, ...right].every(part => /^\d+$/.test(part))) return null;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = Number(left[i] ?? 0);
    const y = Number(right[i] ?? 0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Versions a user on `currentVersion` has not seen; Unreleased counts once an update exists. */
export function selectNewVersions(entries: ChangelogEntry[], currentVersion: string, hasUpdate: boolean): string[] {
  return entries
    .filter(entry => {
      if (entry.version.toLowerCase() === "unreleased") return hasUpdate;
      const cmp = compareVersions(entry.version, currentVersion);
      return cmp !== null && cmp > 0;
    })
    .map(entry => entry.version);
}

/** Primary entries win per version; Unreleased and non-semver stay on top, the rest sort newest first. */
export function mergeChangelogs(primary: ChangelogEntry[], secondary: ChangelogEntry[]): ChangelogEntry[] {
  const seen = new Set(primary.map(entry => entry.version.toLowerCase()));
  const merged = [...primary, ...secondary.filter(entry => !seen.has(entry.version.toLowerCase()))];
  const unversioned = merged.filter(entry => !isSemver(entry.version));
  const versioned = merged
    .filter(entry => isSemver(entry.version))
    .sort((a, b) => compareVersions(b.version, a.version) ?? 0);
  return [...unversioned, ...versioned];
}

export function readBundledChangelog(): string {
  for (const path of [join(import.meta.dir, "..", "CHANGELOG.md"), join(process.cwd(), "CHANGELOG.md")]) {
    try {
      if (existsSync(path)) return readFileSync(path, "utf8");
    } catch {}
  }
  return "";
}

async function fetchRemoteChangelog(repo: string): Promise<ChangelogEntry[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/main/CHANGELOG.md`, {
        signal: controller.signal,
        headers: { "User-Agent": "Klodex-Updater" },
      });
      if (!res.ok) return [];
      return parseChangelog(await res.text());
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

/** Commit subjects of the pending update; the objects are already local after the updater's fetch. */
async function recentRemoteCommits(): Promise<string[]> {
  const git = await resolveGitPath();
  if (!git) return [];
  for (const ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    try {
      const { stdout } = await execFileAsync(git, ["log", `HEAD..${ref}`, "--pretty=format:%s"], {
        cwd: process.cwd(),
        timeout: 8000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });
      const lines = stdout.split("\n").map(line => line.trim()).filter(Boolean);
      if (lines.length) return lines.slice(0, 40);
    } catch {}
  }
  return [];
}

let cache: { key: string; at: number; result: ChangelogResponse } | null = null;

export async function getChangelog(force = false): Promise<ChangelogResponse> {
  const status: UpdateStatus = await checkUpdates(false);
  const key = `${status.latestVersion ?? ""}|${status.hasUpdate}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < 60000) return cache.result;

  const cfg = loadConfig();
  const repo = cfg.updateRepo ?? "lonestill/klodex";
  const bundled = parseChangelog(readBundledChangelog());
  // The bundled file describes the installed version; the pending changes come
  // from main, so fetch the remote copy only when an update is available.
  const entries = status.hasUpdate ? mergeChangelogs(await fetchRemoteChangelog(repo), bundled) : bundled;
  const commits =
    status.hasUpdate && status.updateType === "git" && status.isGitRepo ? await recentRemoteCommits() : [];

  const result: ChangelogResponse = {
    currentVersion: status.currentVersion,
    latestVersion: status.latestVersion,
    hasUpdate: status.hasUpdate,
    newVersions: selectNewVersions(entries, status.currentVersion, status.hasUpdate),
    entries: entries.slice(0, 30),
    commits,
  };
  cache = { key, at: Date.now(), result };
  return result;
}
