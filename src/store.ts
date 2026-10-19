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
    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage (session_id);
    CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage (created_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage (provider);
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
  d.run("DELETE FROM token_usage WHERE session_id = ?", [id]);
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

export type TokenUsageRecord = {
  id: string;
  sessionId: string;
  messageId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  createdAt: number;
};

export type TokenStatsSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
};

export type ProviderTokenStat = {
  provider: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  percentage: number;
};

export type ModelTokenStat = {
  model: string;
  provider: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
};

export type FullTokenStatsReport = {
  total: TokenStatsSummary;
  today: TokenStatsSummary;
  thisWeek: TokenStatsSummary;
  byProvider: ProviderTokenStat[];
  byModel: ModelTokenStat[];
  recent: TokenUsageRecord[];
};

export function recordTokenUsage(input: {
  sessionId?: string;
  messageId?: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number;
}): void {
  const d = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const pTok = Math.max(0, Math.round(input.promptTokens || 0));
  const cTok = Math.max(0, Math.round(input.completionTokens || 0));
  const tTok = Math.max(pTok + cTok, Math.round(input.totalTokens || 0));
  const dur = Math.max(0, Math.round(input.durationMs || 0));

  d.run(
    `INSERT INTO token_usage (id, session_id, message_id, provider, model, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.sessionId || "global", input.messageId ?? null, input.provider, input.model, pTok, cTok, tTok, dur, now],
  );
}

export function getSessionTokenStats(sessionId: string): TokenStatsSummary {
  const d = getDb();
  const row = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE session_id = ?`
  ).get(sessionId) as any;

  return {
    promptTokens: Number(row?.prompt_tokens ?? 0),
    completionTokens: Number(row?.completion_tokens ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    requests: Number(row?.requests ?? 0),
  };
}

export function getFullTokenStats(): FullTokenStatsReport {
  const d = getDb();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 6 * 86400000;

  const totalRow = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage`
  ).get() as any;

  const todayRow = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE created_at >= ?`
  ).get(startOfToday) as any;

  const weekRow = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE created_at >= ?`
  ).get(startOfWeek) as any;

  const totalTokensAll = Number(totalRow?.total_tokens ?? 0);

  const providerRows = d.query(
    `SELECT 
       provider,
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage
     GROUP BY provider
     ORDER BY total_tokens DESC`
  ).all() as any[];

  const modelRows = d.query(
    `SELECT 
       model,
       provider,
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage
     GROUP BY provider, model
     ORDER BY total_tokens DESC
     LIMIT 20`
  ).all() as any[];

  const recentRows = d.query(
    `SELECT 
       id,
       session_id AS sessionId,
       message_id AS messageId,
       provider,
       model,
       prompt_tokens AS promptTokens,
       completion_tokens AS completionTokens,
       total_tokens AS totalTokens,
       duration_ms AS durationMs,
       created_at AS createdAt
     FROM token_usage
     ORDER BY created_at DESC
     LIMIT 50`
  ).all() as any[];

  return {
    total: {
      promptTokens: Number(totalRow?.prompt_tokens ?? 0),
      completionTokens: Number(totalRow?.completion_tokens ?? 0),
      totalTokens: totalTokensAll,
      requests: Number(totalRow?.requests ?? 0),
    },
    today: {
      promptTokens: Number(todayRow?.prompt_tokens ?? 0),
      completionTokens: Number(todayRow?.completion_tokens ?? 0),
      totalTokens: Number(todayRow?.total_tokens ?? 0),
      requests: Number(todayRow?.requests ?? 0),
    },
    thisWeek: {
      promptTokens: Number(weekRow?.prompt_tokens ?? 0),
      completionTokens: Number(weekRow?.completion_tokens ?? 0),
      totalTokens: Number(weekRow?.total_tokens ?? 0),
      requests: Number(weekRow?.requests ?? 0),
    },
    byProvider: providerRows.map((r) => {
      const tot = Number(r.total_tokens ?? 0);
      return {
        provider: String(r.provider),
        totalTokens: tot,
        promptTokens: Number(r.prompt_tokens ?? 0),
        completionTokens: Number(r.completion_tokens ?? 0),
        requests: Number(r.requests ?? 0),
        percentage: totalTokensAll > 0 ? Math.round((tot / totalTokensAll) * 100) : 0,
      };
    }),
    byModel: modelRows.map((r) => ({
      model: String(r.model),
      provider: String(r.provider),
      totalTokens: Number(r.total_tokens ?? 0),
      promptTokens: Number(r.prompt_tokens ?? 0),
      completionTokens: Number(r.completion_tokens ?? 0),
      requests: Number(r.requests ?? 0),
    })),
    recent: recentRows.map((r) => ({
      id: String(r.id),
      sessionId: String(r.sessionId),
      messageId: r.messageId ? String(r.messageId) : null,
      provider: String(r.provider),
      model: String(r.model),
      promptTokens: Number(r.promptTokens ?? 0),
      completionTokens: Number(r.completionTokens ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
      durationMs: Number(r.durationMs ?? 0),
      createdAt: Number(r.createdAt ?? 0),
    })),
  };
}

export function clearTokenUsage(filter?: { sessionId?: string }) {
  const d = getDb();
  if (filter?.sessionId) {
    d.run("DELETE FROM token_usage WHERE session_id = ?", [filter.sessionId]);
  } else {
    d.run("DELETE FROM token_usage");
  }
}
