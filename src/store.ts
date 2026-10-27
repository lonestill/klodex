import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";

let db: Database | null = null;

export function getDb(): Database {
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

    CREATE TABLE IF NOT EXISTS compact_history (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      dropped_messages INTEGER NOT NULL DEFAULT 0,
      tokens_pruned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_compact_session ON compact_history (session_id);
    CREATE INDEX IF NOT EXISTS idx_compact_created ON compact_history (created_at);
    CREATE TABLE IF NOT EXISTS session_context (session_id TEXT PRIMARY KEY, through_idx INTEGER NOT NULL, summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_memory (project_dir TEXT PRIMARY KEY, content TEXT NOT NULL);
  `);

  try {
    backfillLegacyData(db);
  } catch (err) {
    console.error("[store] backfillLegacyData error:", err);
  }

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
  const rows = (d.query("SELECT uid, data FROM message WHERE session_id = ? ORDER BY idx ASC").all(sessionId) as { uid: string; data: string }[]).map(row => ({ uid: row.uid, data: JSON.parse(row.data) }));

  // Auto-heal any dangling/interrupted tool calls that lack tool results
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
          }
        }
      }
    }
  }

  // Repair only this read view; the stored transcript remains an audit record.

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
  d.run("DELETE FROM compact_history WHERE session_id = ?", [id]);
  d.run("DELETE FROM session_context WHERE session_id = ?", [id]);
  d.run("DELETE FROM session WHERE id = ?", [id]);
}

function extractTextFromParts(parts: any[]): string {
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (typeof p.text === "string") out += p.text + "\n";
    if (typeof p.output === "string") out += p.output + "\n";
    if (p.input && typeof p.input === "object") out += JSON.stringify(p.input) + "\n";
  }
  return out.trim();
}

export function recordCompactHistory(input: {
  sessionId: string;
  triggerType: "manual" | "auto_prune";
  droppedMessages: number;
  tokensPruned: number;
}): void {
  const d = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const dropped = Math.max(0, Math.round(input.droppedMessages || 0));
  const pruned = Math.max(0, Math.round(input.tokensPruned || 0));

  d.run(
    `INSERT INTO compact_history (id, session_id, trigger_type, dropped_messages, tokens_pruned, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.sessionId, input.triggerType, dropped, pruned, now],
  );
}

export function compactSessionMessages(sessionId: string, summary?: string): {
  originalCount: number;
  newCount: number;
  dropped: number;
  tokensPruned: number;
} {
  const d = getDb();
  const rows = getContextMessages(sessionId);

  if (rows.length <= 10) return { originalCount: rows.length, newCount: rows.length, dropped: 0, tokensPruned: 0 };
  if (!summary?.trim()) throw new Error("A context summary is required; history was not modified");

  const first = rows[0];
  const tail = rows.slice(-8);
  const droppedRows = rows.slice(1, rows.length - 8);
  const dropped = droppedRows.length;

  let tokensPruned = 0;
  for (const r of droppedRows) {
    const text = extractTextFromParts(r.data?.parts);
    tokensPruned += Math.max(10, Math.ceil(text.length / 4));

  }

  recordCompactHistory({
    sessionId,
    triggerType: "manual",
    droppedMessages: dropped,
    tokensPruned,
  });

  const noticeMsg = {
    uid: "compact-notice",
    data: {
      id: "compact-notice",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: summary,
        },
      ],
    },
  };

  const newRows = [first, noticeMsg, ...tail];

  const cutoff = d
    .query("SELECT idx FROM message WHERE session_id=? ORDER BY idx DESC LIMIT 1 OFFSET 8")
    .get(sessionId) as { idx: number } | null | undefined;
  const throughIdx = cutoff?.idx ?? 0;
  d.run(
    "INSERT INTO session_context (session_id, through_idx, summary) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET through_idx=excluded.through_idx, summary=excluded.summary",
    [sessionId, throughIdx, summary],
  );

  return { originalCount: rows.length, newCount: newRows.length, dropped, tokensPruned };
}

export function getContextMessages(sessionId: string): StoredMessage[] {
  const all = getMessages(sessionId);
  if (!all.length) return [];
  const context = getDb()
    .query("SELECT through_idx, summary FROM session_context WHERE session_id=?")
    .get(sessionId) as { through_idx: number; summary: string } | null;
  if (!context) return all;
  const tail = getDb()
    .query("SELECT uid, data FROM message WHERE session_id=? AND idx>? ORDER BY idx")
    .all(sessionId, context.through_idx) as { uid: string; data: string }[];
  return [
    all[0]!,
    {
      uid: "compact-notice",
      data: {
        id: "compact-notice",
        role: "assistant",
        parts: [{ type: "text", text: context.summary }],
      },
    },
    ...tail.map((row) => ({ uid: row.uid, data: JSON.parse(row.data) })),
  ];
}

export function hasSessionContext(sessionId: string): boolean {
  const d = getDb();
  const row = d.query("SELECT 1 FROM session_context WHERE session_id=?").get(sessionId);
  return Boolean(row);
}
export function getProjectMemory(projectDir: string) {
  return (getDb().query("SELECT content FROM project_memory WHERE project_dir=?").get(projectDir) as { content: string } | null)?.content ?? "";
}
export function saveProjectMemory(projectDir: string, content: string) {
  if (content.length > 30000) throw new Error("Project memory is limited to 30,000 characters");
  getDb().run("INSERT INTO project_memory VALUES (?,?) ON CONFLICT(project_dir) DO UPDATE SET content=excluded.content", [projectDir, content]);
}

export function backfillLegacyData(d: Database): void {
  // 1. Recover any orphaned sessions that exist in `message` but not in `session`
  const orphanSessions = d.query(`
    SELECT DISTINCT m.session_id 
    FROM message m 
    LEFT JOIN session s ON m.session_id = s.id 
    WHERE s.id IS NULL
  `).all() as { session_id: string }[];

  const now = Date.now();
  for (const os of orphanSessions) {
    d.run(
      "INSERT OR IGNORE INTO session (id, title, provider, model, project_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        os.session_id,
        "Восстановленный чат",
        "tagflow",
        "heabsy-glm53-flash-unc",
        process.cwd(),
        now,
        now,
      ],
    );
  }

  // 2. Backfill token_usage for assistant messages that lack usage records
  const assistantMessages = d.query(`
    SELECT m.session_id, m.idx, m.uid, m.data, s.provider, s.model, s.created_at
    FROM message m
    LEFT JOIN session s ON m.session_id = s.id
    ORDER BY m.session_id, m.idx ASC
  `).all() as any[];

  const existingRecords = new Set<string>();
  const tuRows = d.query("SELECT message_id FROM token_usage WHERE message_id IS NOT NULL").all() as any[];
  for (const r of tuRows) {
    if (r.message_id) existingRecords.add(r.message_id);
  }

  const sessionMsgMap = new Map<string, any[]>();
  for (const row of assistantMessages) {
    let list = sessionMsgMap.get(row.session_id);
    if (!list) {
      list = [];
      sessionMsgMap.set(row.session_id, list);
    }
    list.push(row);
  }

  for (const [sessionId, rows] of sessionMsgMap.entries()) {
    for (let i = 0; i < rows.length; i++) {
      const cur = rows[i];
      let data: any = null;
      try {
        data = JSON.parse(cur.data);
      } catch {
        continue;
      }
      if (data?.role !== "assistant") continue;

      const msgId = cur.uid || data?.id;
      if (msgId && existingRecords.has(msgId)) {
        continue;
      }

      const isCompactNotice =
        msgId === "compact-notice" ||
        msgId?.startsWith("compact-") ||
        (Array.isArray(data.parts) &&
          data.parts.some(
            (p: any) => typeof p.text === "string" && p.text.includes("была сжата для освобождения контекста"),
          ));

      if (isCompactNotice) {
        const noticeText = extractTextFromParts(data.parts);
        const match = noticeText.match(/(\d+)\s+сообщен/);
        const droppedCount = match ? parseInt(match[1]!, 10) : 5;
        const estimatedPruned = droppedCount * 850;

        const existingCompact = d.query("SELECT id FROM compact_history WHERE session_id = ?").get(sessionId);
        if (!existingCompact) {
          d.run(
            "INSERT INTO compact_history (id, session_id, trigger_type, dropped_messages, tokens_pruned, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), sessionId, "manual", droppedCount, estimatedPruned, cur.created_at || now],
          );
        }
        continue;
      }

      let provider = cur.provider || "tagflow";
      let model = cur.model || "heabsy-glm53-flash-unc";
      if (typeof data.model === "string" && data.model.includes("/")) {
        const slashIdx = data.model.indexOf("/");
        provider = data.model.slice(0, slashIdx);
        model = data.model.slice(slashIdx + 1);
      }

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let durationMs = 0;

      if (data.usage && (data.usage.totalTokens || data.usage.promptTokens)) {
        promptTokens = Number(data.usage.promptTokens || 0);
        completionTokens = Number(data.usage.completionTokens || 0);
        totalTokens = Number(data.usage.totalTokens || promptTokens + completionTokens);
        durationMs = Number(data.usage.durationMs || 0);
      } else {
        let promptText = "";
        for (let j = i - 1; j >= 0; j--) {
          try {
            const prev = JSON.parse(rows[j].data);
            if (prev.role === "user") {
              promptText = extractTextFromParts(prev.parts);
              break;
            }
          } catch {}
        }
        const completionText = extractTextFromParts(data.parts);
        promptTokens = Math.max(16, Math.ceil((promptText || "Запрос пользователя").length / 4) + 64);
        completionTokens = Math.max(8, Math.ceil(completionText.length / 4));
        totalTokens = promptTokens + completionTokens;
      }

      const recId = crypto.randomUUID();
      const createdAt = cur.created_at ? Number(cur.created_at) + cur.idx * 1000 : now;

      d.run(
        `INSERT INTO token_usage (id, session_id, message_id, provider, model, prompt_tokens, completion_tokens, total_tokens, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [recId, sessionId, msgId ?? null, provider, model, promptTokens, completionTokens, totalTokens, durationMs, createdAt],
      );
      if (msgId) existingRecords.add(msgId);
    }
  }
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

export type CompactStatsSummary = {
  tokensPruned: number;
  droppedMessages: number;
  compactions: number;
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
  compact: CompactStatsSummary;
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

export function getSessionTokenStats(sessionId: string): TokenStatsSummary & { compact: CompactStatsSummary } {
  const d = getDb();
  const row = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE session_id = ?`,
  ).get(sessionId) as any;

  const compactRow = d.query(
    `SELECT 
       COALESCE(SUM(tokens_pruned), 0) AS total_tokens_pruned,
       COALESCE(SUM(dropped_messages), 0) AS total_dropped_messages,
       COUNT(*) AS total_compactions
     FROM compact_history WHERE session_id = ?`,
  ).get(sessionId) as any;

  return {
    promptTokens: Number(row?.prompt_tokens ?? 0),
    completionTokens: Number(row?.completion_tokens ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
    requests: Number(row?.requests ?? 0),
    compact: {
      tokensPruned: Number(compactRow?.total_tokens_pruned ?? 0),
      droppedMessages: Number(compactRow?.total_dropped_messages ?? 0),
      compactions: Number(compactRow?.total_compactions ?? 0),
    },
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
     FROM token_usage`,
  ).get() as any;

  const todayRow = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE created_at >= ?`,
  ).get(startOfToday) as any;

  const weekRow = d.query(
    `SELECT 
       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
       COALESCE(SUM(total_tokens), 0) AS total_tokens,
       COUNT(*) AS requests
     FROM token_usage WHERE created_at >= ?`,
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
     ORDER BY total_tokens DESC`,
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
     LIMIT 20`,
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
     LIMIT 50`,
  ).all() as any[];

  const compactRow = d.query(
    `SELECT 
       COALESCE(SUM(tokens_pruned), 0) AS total_tokens_pruned,
       COALESCE(SUM(dropped_messages), 0) AS total_dropped_messages,
       COUNT(*) AS total_compactions
     FROM compact_history`,
  ).get() as any;

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
    compact: {
      tokensPruned: Number(compactRow?.total_tokens_pruned ?? 0),
      droppedMessages: Number(compactRow?.total_dropped_messages ?? 0),
      compactions: Number(compactRow?.total_compactions ?? 0),
    },
  };
}

export function clearTokenUsage(filter?: { sessionId?: string }) {
  const d = getDb();
  if (filter?.sessionId) {
    d.run("DELETE FROM token_usage WHERE session_id = ?", [filter.sessionId]);
    d.run("DELETE FROM compact_history WHERE session_id = ?", [filter.sessionId]);
  } else {
    d.run("DELETE FROM token_usage");
    d.run("DELETE FROM compact_history");
  }
}
