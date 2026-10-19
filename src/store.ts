import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;
  mkdirSync(paths.dataDir, { recursive: true });
  db = new Database(join(paths.dataDir, "klodex.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT,
      provider TEXT,
      model TEXT,
      project_dir TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS message (
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      uid TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (session_id, idx)
    );
    CREATE TABLE IF NOT EXISTS subagent (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kind TEXT,
      prompt TEXT,
      model TEXT,
      transcript TEXT,
      created_at INTEGER
    );
  `);
  return db;
}

export type SessionRow = {
  id: string;
  title: string | null;
  provider: string | null;
  model: string | null;
  project_dir: string;
  created_at: number;
  updated_at: number;
};

export type StoredMessage = {
  uid: string;
  data: any;
};

export function createSession(input: {
  projectDir: string;
  provider?: string;
  model?: string;
  title?: string;
}): SessionRow {
  const d = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  d.run(
    "INSERT INTO session (id, title, provider, model, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      input.title ?? null,
      input.provider ?? null,
      input.model ?? null,
      input.projectDir,
      now,
      now,
    ],
  );
  return getSession(id)!;
}

export function listSessions(): SessionRow[] {
  const d = getDb();
  return d.query("SELECT * FROM session ORDER BY updated_at DESC").all() as SessionRow[];
}

export function getSession(id: string): SessionRow | null {
  const d = getDb();
  return (d.query("SELECT * FROM session WHERE id = ?").get(id) as SessionRow | null) ?? null;
}

export function updateSessionMeta(id: string, patch: { title?: string; provider?: string; model?: string; projectDir?: string }) {
  const d = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.title !== undefined) { sets.push("title = ?"); vals.push(patch.title); }
  if (patch.provider !== undefined) { sets.push("provider = ?"); vals.push(patch.provider); }
  if (patch.model !== undefined) { sets.push("model = ?"); vals.push(patch.model); }
  if (patch.projectDir !== undefined) { sets.push("project_dir = ?"); vals.push(patch.projectDir); }
  sets.push("updated_at = ?");
  vals.push(Date.now(), id);
  d.run(`UPDATE session SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export function getMessages(sessionId: string): StoredMessage[] {
  const d = getDb();
  const rows = (d
    .query("SELECT uid, data FROM message WHERE session_id = ? ORDER BY idx ASC")
    .all(sessionId) as any[])
    .map((r: any) => ({ uid: r.uid, data: JSON.parse(r.data) }));

  // Auto-heal any dangling/interrupted tool calls that lack tool results
  let needsDbUpdate = false;
  for (const m of rows) {
    if (m.data?.role === "assistant" && Array.isArray(m.data.parts)) {
      for (const p of m.data.parts) {
        if (p && typeof p.type === "string" && (p.type.startsWith("tool-") || p.toolCallId)) {
          const hasOutput =
            p.state === "output-available" ||
            p.state === "output-error" ||
            p.output !== undefined ||
            p.errorText !== undefined;
          if (!hasOutput || p.state === "input-available") {
            p.state = "output-error";
            p.errorText = "[Выполнение прервано пользователем (Stop)]";
            needsDbUpdate = true;
          }
        }
      }
    }
  }

  if (needsDbUpdate) {
    try {
      d.transaction(() => {
        for (const m of rows) {
          d.run("UPDATE message SET data = ? WHERE uid = ?", [JSON.stringify(m.data), m.uid]);
        }
      })();
    } catch {}
  }

  return rows;
}

export function appendMessage(sessionId: string, uid: string, message: any): number {
  const d = getDb();
  const tx = d.transaction(() => {
    const row = d
      .query("SELECT COALESCE(MAX(idx), -1) AS max FROM message WHERE session_id = ?")
      .get(sessionId) as any;
    const idx = (row?.max ?? -1) + 1;
    d.run("INSERT INTO message (session_id, idx, uid, data) VALUES (?, ?, ?, ?)", [sessionId, idx, uid, JSON.stringify(message)]);
    d.run("UPDATE session SET updated_at = ? WHERE id = ?", [Date.now(), sessionId]);
    return idx;
  });
  return tx();
}

export function saveSubagent(input: { sessionId: string; kind: string; prompt: string; model: string; transcript: any[] }) {
  const d = getDb();
  d.run(
    "INSERT INTO subagent (id, session_id, kind, prompt, model, transcript, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      crypto.randomUUID(),
      input.sessionId,
      input.kind,
      input.prompt,
      input.model,
      JSON.stringify(input.transcript),
      Date.now(),
    ],
  );
}

export function deleteSession(id: string) {
  const d = getDb();
  d.run("DELETE FROM message WHERE session_id = ?", [id]);
  d.run("DELETE FROM subagent WHERE session_id = ?", [id]);
  d.run("DELETE FROM session WHERE id = ?", [id]);
}

export function compactSessionMessages(sessionId: string): { originalCount: number; newCount: number; dropped: number } {
  const d = getDb();
  const rows = (d
    .query("SELECT uid, data FROM message WHERE session_id = ? ORDER BY idx ASC")
    .all(sessionId) as any[])
    .map((r: any) => ({ uid: r.uid, data: JSON.parse(r.data) }));

  if (rows.length <= 10) return { originalCount: rows.length, newCount: rows.length, dropped: 0 };

  const first = rows[0];
  const tail = rows.slice(-8);
  const dropped = rows.length - 1 - tail.length;

  const noticeMsg = {
    uid: crypto.randomUUID(),
    data: {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `[... Предыдущая часть диалога (${dropped} сообщений) была сжата для освобождения контекста ...]`,
        },
      ],
    },
  };

  const newRows = [first, noticeMsg, ...tail];

  d.transaction(() => {
    d.run("DELETE FROM message WHERE session_id = ?", [sessionId]);
    newRows.forEach((r, idx) => {
      d.run("INSERT INTO message (session_id, idx, uid, data) VALUES (?, ?, ?, ?)", [
        sessionId,
        idx,
        r.uid,
        JSON.stringify(r.data),
      ]);
    });
    d.run("UPDATE session SET updated_at = ? WHERE id = ?", [Date.now(), sessionId]);
  })();

  return { originalCount: rows.length, newCount: newRows.length, dropped };
}
