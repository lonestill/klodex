import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";

export type RunState =
  "queued" | "running" | "completed" | "interrupted" | "failed" | "cancelled";
export interface Run {
  id: string;
  sessionId: string;
  projectDir: string;
  prompt: string;
  model: string;
  state: RunState;
  createdAt: number;
  updatedAt: number;
  before?: string;
  after?: string;
  error?: string;
  parentId?: string;
}
let db: Database;
function database() {
  if (db) return db;
  mkdirSync(paths.dataDir, { recursive: true });
  db = new Database(join(paths.dataDir, "runs.db"));
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_run ON events(run_id, seq);`,
  );
  return db;
}
export function saveRun(run: Run) {
  run.updatedAt = Date.now();
  database().run(
    "INSERT INTO runs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, data=excluded.data",
    [run.id, run.sessionId, run.state, JSON.stringify(run)],
  );
  return run;
}
export function newRun(
  input: Pick<Run, "sessionId" | "projectDir" | "prompt" | "model"> & {
    parentId?: string;
  },
) {
  return saveRun({
    ...input,
    id: crypto.randomUUID(),
    state: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
export function getRun(id: string): Run | undefined {
  const row = database().query("SELECT data FROM runs WHERE id=?").get(id) as {
    data: string;
  } | null;
  return row ? JSON.parse(row.data) : undefined;
}
export function listRuns(sessionId?: string): Run[] {
  const rows = (
    sessionId
      ? database()
          .query("SELECT data FROM runs WHERE session_id=? ORDER BY rowid DESC")
          .all(sessionId)
      : database().query("SELECT data FROM runs ORDER BY rowid DESC").all()
  ) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data));
}
export function recordEvent(runId: string, event: unknown) {
  const result = database().run(
    "INSERT INTO events(run_id,data) VALUES (?,?)",
    [runId, JSON.stringify(event)],
  );
  return Number(result.lastInsertRowid);
}
export function runEvents(runId: string, after = 0) {
  return (
    database()
      .query(
        "SELECT seq,data FROM events WHERE run_id=? AND seq>? ORDER BY seq",
      )
      .all(runId, after) as { seq: number; data: string }[]
  ).map((row) => ({ seq: row.seq, event: JSON.parse(row.data) }));
}
export function recoverRuns() {
  for (const run of listRuns())
    if (run.state === "running")
      saveRun({
        ...run,
        state: "interrupted",
        error:
          "Server restarted. Inspect completed operations before continuing.",
      });
}
export function recoveryContext(run: Run) {
  const operations = runEvents(run.id).filter(({ event }) =>
    ["tool", "toolres", "swarm_operation", "swarm_update"].includes(event.t),
  );
  return `Continue interrupted task: ${run.prompt}\nPrior operations (results may have already changed files or external state):\n${JSON.stringify(operations).slice(-60000)}\nInspect the current filesystem and completed results first. Do not blindly repeat commands, commits, migrations or other side effects. Operations without a result have UNKNOWN outcomes. Continue only remaining work.`;
}
