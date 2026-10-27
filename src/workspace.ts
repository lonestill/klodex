import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  chmodSync,
  symlinkSync,
  readlinkSync,
} from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { paths } from "./config.ts";

export function git(
  dir: string,
  args: string[],
  input?: Buffer | string,
  env?: Record<string, string>,
) {
  return execFileSync("git", ["-C", dir, ...args], {
    input,
    env: { ...process.env, ...env },
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
export function repository(dir: string) {
  return git(dir, ["rev-parse", "--show-toplevel"]).toString().trim();
}

// A private index captures tracked and non-ignored untracked files without touching
// the user's index, branch or commits. The hidden ref keeps the objects alive.
export function snapshot(dir: string, id: string): string {
  const root = repository(dir);
  mkdirSync(join(paths.dataDir, "indexes"), { recursive: true });
  const temp = mkdtempSync(join(paths.dataDir, "indexes", "snapshot-"));
  const env = { GIT_INDEX_FILE: join(temp, "index") };
  try {
    try {
      git(root, ["read-tree", "HEAD"], undefined, env);
    } catch {
      git(root, ["read-tree", "--empty"], undefined, env);
    }
    git(root, ["add", "-A", "--", ".", ":(exclude).klodex"], undefined, env);
    const tree = git(root, ["write-tree"], undefined, env).toString().trim();
    const commit = git(root, [
      "-c",
      "user.name=Klodex",
      "-c",
      "user.email=local@klodex",
      "commit-tree",
      tree,
      "-m",
      `Klodex checkpoint ${id}`,
    ])
      .toString()
      .trim();
    git(root, ["update-ref", `refs/klodex/${id}`, commit]);
    return commit;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function changes(dir: string, before: string, after: string) {
  const root = repository(dir);
  const entries = git(root, [
    "diff",
    "--numstat",
    "-z",
    "--no-renames",
    before,
    after,
  ])
    .toString()
    .split("\0")
    .filter(Boolean);
  return entries.map((entry) => {
    const [added, removed, ...name] = entry.split("\t");
    return {
      path: name.join("\t"),
      added: added === "-" ? null : Number(added),
      removed: removed === "-" ? null : Number(removed),
    };
  });
}
export function diff(
  dir: string,
  before: string,
  after: string,
  file?: string,
) {
  return git(repository(dir), [
    "--literal-pathspecs",
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--no-color",
    before,
    after,
    "--",
    ...(file ? [file] : []),
  ]).toString();
}
type Entry = { mode: string; hash: string };
function treeEntries(dir: string, ref: string) {
  const entries = new Map<string, Entry>();
  for (const row of git(dir, ["ls-tree", "-rz", ref])
    .toString()
    .split("\0")
    .filter(Boolean)) {
    const tab = row.indexOf("\t");
    const [mode, , hash] = row.slice(0, tab).split(" ");
    entries.set(row.slice(tab + 1), { mode: mode!, hash: hash! });
  }
  return entries;
}
function safeTarget(root: string, file: string) {
  const target = resolve(root, file);
  const rel = relative(root, target);
  if (
    !rel ||
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    rel.split(/[\\/]/).includes(".git")
  )
    throw new Error("Invalid checkpoint path");
  let parent = dirname(target);
  while (parent !== root) {
    if (existsSync(parent)) {
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink()) throw new Error(`Symlink parent: ${file}`);
      if (!stat.isDirectory())
        throw new Error(`Parent is not a directory; restore manually: ${file}`);
    }
    parent = dirname(parent);
  }
  return target;
}
function matches(dir: string, target: string, entry?: Entry) {
  let stat;
  try {
    stat = lstatSync(target);
  } catch {
    return !entry;
  }
  if (!entry || stat.isDirectory()) return false;
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(readlinkSync(target))
    : readFileSync(target);
  const hash = git(
    dir,
    [
      "hash-object",
      ...(stat.isSymbolicLink() ? [] : [`--path=${relative(dir, target)}`]),
      "--stdin",
    ],
    bytes,
  )
    .toString()
    .trim();
  const mode = stat.isSymbolicLink()
    ? "120000"
    : stat.mode & 0o111
      ? "100755"
      : "100644";
  return hash === entry.hash && mode === entry.mode;
}
// Applies only the checkpoint delta. Later/manual edits cause a conflict instead
// of being overwritten. Preflight every file before writing any of them.
export function applySnapshot(
  dir: string,
  from: string,
  to: string,
  files?: string[],
) {
  const root = repository(dir);
  const source = treeEntries(root, from),
    destination = treeEntries(root, to);
  const changed = changes(root, from, to).map((c) => c.path);
  const selected = files ?? changed;
  if (selected.some((file) => !changed.includes(file)))
    throw new Error("File is not part of this checkpoint");
  const plan = selected.map((file) => {
    const target = safeTarget(root, file),
      old = source.get(file),
      next = destination.get(file);
    if (old?.mode === "160000" || next?.mode === "160000")
      throw new Error(`Submodule requires manual integration: ${file}`);
    if (!matches(root, target, old))
      throw new Error(`Conflict: ${file} changed after the checkpoint`);
    return {
      target,
      next,
      content: next ? git(root, ["cat-file", "blob", next.hash]) : null,
    };
  });
  for (const { target, next, content } of plan) {
    rmSync(target, { force: true });
    if (!next || !content) continue;
    mkdirSync(dirname(target), { recursive: true });
    if (next.mode === "120000") symlinkSync(content.toString(), target);
    else {
      writeFileSync(target, content);
      chmodSync(target, next.mode === "100755" ? 0o755 : 0o644);
    }
  }
  return selected;
}
export function createWorktree(dir: string, ref: string, id: string) {
  const root = repository(dir);
  const target = join(
    paths.dataDir,
    "worktrees",
    id.replace(/[^a-zA-Z0-9_-]/g, "_"),
  );
  mkdirSync(dirname(target), { recursive: true });
  git(root, ["worktree", "add", "--detach", target, ref]);
  return target;
}
