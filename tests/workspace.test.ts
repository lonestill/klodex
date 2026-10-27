import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paths } from "../src/config.ts";
import {
  snapshot,
  git,
  changes,
  applySnapshot,
  createWorktree,
} from "../src/workspace.ts";
import {
  createSession,
  appendMessage,
  getMessages,
  getContextMessages,
  compactSessionMessages,
  getProjectMemory,
  saveProjectMemory,
} from "../src/store.ts";
import {
  newRun,
  saveRun,
  recoverRuns,
  getRun,
  recordEvent,
  runEvents,
  recoveryContext,
} from "../src/runs.ts";
import { workspaceApi } from "../src/workspace-api.ts";
import { buildTools } from "../src/tools.ts";

const temp = mkdtempSync(join(tmpdir(), "klodex-test-"));
paths.dataDir = join(temp, "data");
afterAll(() => rmSync(temp, { recursive: true, force: true }));
function repo() {
  const dir = mkdtempSync(join(temp, "repo-"));
  git(dir, ["init"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@local"]);
  writeFileSync(join(dir, "file.txt"), "original\n");
  writeFileSync(join(dir, ".gitignore"), "ignored/\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "initial"]);
  return dir;
}
describe("task checkpoints", () => {
  test("restore preserves staged and pre-existing edits, includes shell edits and new files", () => {
    const dir = repo();
    writeFileSync(join(dir, "file.txt"), "user staged\n");
    git(dir, ["add", "file.txt"]);
    writeFileSync(join(dir, "file.txt"), "user unstaged\n");
    const index = git(dir, ["show", ":file.txt"]).toString();
    const before = snapshot(dir, crypto.randomUUID());
    writeFileSync(join(dir, "file.txt"), "agent\n");
    writeFileSync(join(dir, "new.txt"), "created by shell\n");
    const after = snapshot(dir, crypto.randomUUID());
    expect(changes(dir, before, after).map((item) => item.path)).toEqual([
      "file.txt",
      "new.txt",
    ]);
    applySnapshot(dir, after, before);
    expect(readFileSync(join(dir, "file.txt"), "utf8")).toBe("user unstaged\n");
    expect(existsSync(join(dir, "new.txt"))).toBe(false);
    expect(git(dir, ["show", ":file.txt"]).toString()).toBe(index);
  });
  test("conflicts preflight every file without partial writes", () => {
    const dir = repo();
    const before = snapshot(dir, crypto.randomUUID());
    writeFileSync(join(dir, "aaa.txt"), "agent\n");
    writeFileSync(join(dir, "file.txt"), "agent\n");
    const after = snapshot(dir, crypto.randomUUID());
    writeFileSync(join(dir, "file.txt"), "later user edit\n");
    expect(() => applySnapshot(dir, after, before)).toThrow("Conflict");
    expect(readFileSync(join(dir, "aaa.txt"), "utf8")).toBe("agent\n");
    expect(readFileSync(join(dir, "file.txt"), "utf8")).toBe(
      "later user edit\n",
    );
  });
  test("isolated worktrees integrate independent files and reject overlapping edits", () => {
    const dir = repo(),
      base = snapshot(dir, crypto.randomUUID());
    const left = createWorktree(dir, base, crypto.randomUUID());
    const right = createWorktree(dir, base, crypto.randomUUID());
    writeFileSync(join(left, "file.txt"), "left\n");
    writeFileSync(join(right, "file.txt"), "right\n");
    expect(readFileSync(join(dir, "file.txt"), "utf8")).toBe("original\n");
    applySnapshot(dir, base, snapshot(left, crypto.randomUUID()));
    expect(() =>
      applySnapshot(dir, base, snapshot(right, crypto.randomUUID())),
    ).toThrow("Conflict");
    expect(readFileSync(join(right, "file.txt"), "utf8")).toBe("right\n");
  });
  test("ignored tracked files remain tracked; ignored artifacts are excluded", () => {
    const dir = repo();
    writeFileSync(join(dir, ".gitignore"), "ignored/\nfile.txt\n");
    mkdirSync(join(dir, "ignored"));
    writeFileSync(join(dir, "ignored", "secret"), "ignored");
    const base = snapshot(dir, crypto.randomUUID());
    writeFileSync(join(dir, "file.txt"), "changed\n");
    expect(
      changes(dir, base, snapshot(dir, crypto.randomUUID())).map(
        (item) => item.path,
      ),
    ).toEqual(["file.txt"]);
  });
  test("refuses symlink-parent writes outside repository", () => {
    const dir = repo();
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "file"), "before");
    const before = snapshot(dir, crypto.randomUUID());
    writeFileSync(join(dir, "nested", "file"), "after");
    const after = snapshot(dir, crypto.randomUUID());
    rmSync(join(dir, "nested"), { recursive: true });
    symlinkSync(temp, join(dir, "nested"));
    expect(() => applySnapshot(dir, after, before)).toThrow("Symlink parent");
  });
  test("commit API refuses pre-existing edits and preserves unrelated staged files", async () => {
    const dir = repo();
    const session = createSession({ projectDir: dir });
    const run = newRun({
      sessionId: session.id,
      projectDir: dir,
      prompt: "edit",
      model: "test/model",
    });
    run.before = snapshot(dir, `${run.id}-before`);
    writeFileSync(join(dir, "file.txt"), "agent\n");
    run.after = snapshot(dir, `${run.id}-after`);
    run.state = "completed";
    saveRun(run);
    writeFileSync(join(dir, "other.txt"), "user staged\n");
    git(dir, ["add", "other.txt"]);
    const response = await workspaceApi(
      new Request(
        `http://localhost/api/workspace/${session.id}/commit?runId=${run.id}`,
        { method: "POST", body: JSON.stringify({ message: "task commit" }) },
      ),
      () => false,
    );
    expect(response?.status).toBe(200);
    expect(
      git(dir, ["diff", "--cached", "--name-only"]).toString().trim(),
    ).toBe("other.txt");
    writeFileSync(join(dir, "file.txt"), "pre-existing\n");
    run.before = snapshot(dir, `${run.id}-dirty`);
    writeFileSync(join(dir, "file.txt"), "next agent\n");
    run.after = snapshot(dir, `${run.id}-next`);
    saveRun(run);
    const refused = await workspaceApi(
      new Request(
        `http://localhost/api/workspace/${session.id}/commit?runId=${run.id}`,
        { method: "POST", body: JSON.stringify({ message: "unsafe" }) },
      ),
      () => false,
    );
    expect(refused?.status).toBe(409);
  });
});
test("compaction keeps complete history and subsequent turns; repeated compaction is non-destructive", () => {
  const session = createSession({ projectDir: temp });
  for (let i = 0; i < 20; i++)
    appendMessage(session.id, `msg${i}`, {
      id: `msg${i}`,
      role: i % 2 ? "assistant" : "user",
      parts: [{ type: "text", text: `message ${i}` }],
    });
  const original = getMessages(session.id);
  expect(() => compactSessionMessages(session.id)).toThrow("summary");
  compactSessionMessages(session.id, "Goal, decisions, checks, remaining work");
  expect(getMessages(session.id)).toEqual(original);
  expect(getContextMessages(session.id)).toHaveLength(10);
  appendMessage(session.id, "new", {
    id: "new",
    role: "user",
    parts: [{ type: "text", text: "continue" }],
  });
  expect(getContextMessages(session.id).at(-1)?.uid).toBe("new");
  compactSessionMessages(session.id, "Updated decisions");
  expect(getMessages(session.id)).toHaveLength(21);
  expect(getContextMessages(session.id)).toHaveLength(10);
  saveProjectMemory(temp, "Use bun");
  expect(getProjectMemory(temp)).toBe("Use bun");
});
test("recovery retains completed operations and marks only active tasks interrupted", () => {
  const run = newRun({
    sessionId: "recovery",
    projectDir: temp,
    prompt: "build",
    model: "test/model",
  });
  saveRun({ ...run, state: "running" });
  const queued = newRun({
    sessionId: "recovery",
    projectDir: temp,
    prompt: "next",
    model: "test/model",
  });
  const seq = recordEvent(run.id, {
    t: "tool",
    name: "bash",
    input: { command: "migration" },
  });
  recordEvent(run.id, { t: "toolres", name: "bash", output: "done" });
  recoverRuns();
  expect(getRun(run.id)?.state).toBe("interrupted");
  expect(getRun(queued.id)?.state).toBe("queued");
  expect(runEvents(run.id, seq)).toHaveLength(1);
  expect(recoveryContext(getRun(run.id)!)).toContain("migration");
  expect(recoveryContext(getRun(run.id)!)).toContain("UNKNOWN");
});
test.skipIf(process.platform === "win32")(
  "cancelling a shell command stops descendants before they write",
  async () => {
    const controller = new AbortController();
    const dir = mkdtempSync(join(temp, "cancel-"));
    const tools = buildTools({ projectDir: dir, signal: controller.signal });
    const result = tools.bash.execute!(
      { command: "(sleep 1; touch late-write) & wait", timeout_seconds: 5 },
      {} as any,
    );
    setTimeout(() => controller.abort(), 150);
    await result;
    await Bun.sleep(1200);
    expect(existsSync(join(dir, "late-write"))).toBe(false);
  },
);
