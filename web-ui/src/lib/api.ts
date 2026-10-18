import type { UIMessage } from "ai";

export interface KlodexModel {
  id: string;
  name: string;
  reasoning?: boolean;
  toolCall: boolean;
  contextWindow?: number;
  costInput?: number;
  costOutput?: number;
  free?: boolean;
  deprecated?: boolean;
}

export type ProviderCategory = "free_keyless" | "free_key" | "local" | "paid";

export const CATEGORY_ORDER: ProviderCategory[] = ["free_keyless", "free_key", "local", "paid"];

export const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  free_keyless: "Free без ключа",
  free_key: "Free с ключом",
  local: "Локальные",
  paid: "Платные",
};

export const CATEGORY_DESC: Record<ProviderCategory, string> = {
  free_keyless: "Работают без API-ключей (OpenCode, Pollinations, DeepAI, Binjie, Antigravity)",
  free_key: "Бесплатные модели провайдеров, требуется API-ключ (OpenRouter и др.)",
  local: "Локальные нейросети на машине (Ollama, LM Studio)",
  paid: "Платные API (OpenAI, Anthropic, Google и др.)",
};

export const CATEGORY_BADGE: Record<ProviderCategory, { label: string; className: string }> = {
  free_keyless: { label: "Free без ключа", className: "bg-amber-500/15 text-amber-500 border-transparent" },
  free_key: { label: "Free с ключом", className: "bg-emerald-500/15 text-emerald-500 border-transparent" },
  local: { label: "Локально", className: "bg-sky-500/15 text-sky-500 border-transparent" },
  paid: { label: "Платные", className: "bg-zinc-500/15 text-zinc-400 border-transparent" },
};

export interface KlodexProvider {
  id: string;
  name: string;
  status: "ready" | "local" | "keyless" | "needs_key";
  hasKey: boolean;
  note?: string;
  baseURL?: string;
  npm?: string;
  category?: ProviderCategory;
  freeCount?: number;
  total?: number;
  models: KlodexModel[];
}

export type ProviderSort = "category" | "alpha" | "models";

export type KlodexSettings = {
  defaultProvider?: string;
  defaultModel?: string;
  maxSteps: number;
  maxSubagentSteps: number;
  systemPrompt?: string;
  providerSort: ProviderSort;
  subagentModels: { explore?: string; general?: string };
  firstRunCompleted?: boolean;
  updateRepo?: string;
  version?: string;
};

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

export type PromptType = "system" | "user" | "composite";

export type SkillItem = {
  id: string;
  name: string;
  description: string;
  category?: string;
  version?: string;
  author?: string;
  triggers?: string[];
  tags?: string[];
  path?: string;
  body?: string;
  rawBody?: string;
  isInstalled?: boolean;
  isEnabled?: boolean;
  isProjectLevel?: boolean;
  localPath?: string;
};

export type PromptItem = {
  id: string;
  name: string;
  type: PromptType;
  slash?: string;
  category?: string;
  version?: string;
  author?: string;
  description: string;
  tags?: string[];
  path?: string;
  systemContent?: string;
  userContent?: string;
  rawBody?: string;
  isInstalled?: boolean;
  isEnabled?: boolean;
  isProjectLevel?: boolean;
  localPath?: string;
};

export type CatalogResponse = {
  categories: { id: string; name: string }[];
  skills: SkillItem[];
  prompts: PromptItem[];
  updatedAt: string;
};

export type SlashCommand = {
  slash: string;
  id: string;
  name: string;
  type: string;
  description: string;
  userContent?: string;
  systemContent?: string;
  isStock?: boolean;
};

export interface SessionRow {
  id: string;
  title: string | null;
  provider: string | null;
  model: string | null;
  project_dir: string;
  created_at: number;
  updated_at: number;
}

export interface StoredMessage {
  uid: string;
  data: UIMessage;
}

export type AgentEvent =
  | { t: "start"; provider: string; model: string }
  | {
      t: "status";
      message: string;
      stage?: "connecting" | "waiting" | "retry" | "tool" | "thinking" | "streaming";
      attempt?: number;
      delayMs?: number;
      elapsedMs?: number;
    }
  | { t: "text"; d: string }
  | { t: "reason"; d: string }
  | { t: "tool"; callId: string; name: string; input: unknown }
  | { t: "toolres"; callId: string; name: string; output: string; isError: boolean }
  | { t: "swarm_start"; swarmId: string; total: number; tasks: any[] }
  | { t: "swarm_update"; swarmId: string; taskId: string; status: "running" | "done" | "error" | "ratelimit"; action?: string; preview?: string }
  | { t: "swarm_note"; swarmId: string; author: string; key: string }
  | { t: "swarm_msg"; swarmId: string; from: string; to: string }
  | { t: "swarm_end"; swarmId: string; ok: number; failed: number }
  | { t: "finish"; detail: { finishReason: string; steps: number; tokens: number }; messageId?: string }
  | { t: "title"; title: string }
  | { t: "error"; message: string };

export interface ChatRequest {
  sessionId: string;
  message?: string;
  model?: string;
  provider?: string;
  reconnect?: boolean;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  catalog: (refresh = false) =>
    json<{ providers: KlodexProvider[] }>(refresh ? "/api/catalog/refresh" : "/api/catalog", { method: refresh ? "POST" : "GET" }),

  sessions: () => json<SessionRow[]>("/api/sessions"),

  createSession: (projectDir?: string, provider?: string, model?: string) =>
    json<SessionRow>("/api/sessions", { method: "POST", body: JSON.stringify({ projectDir, provider, model }) }),

  session: (id: string) => json<SessionRow>(`/api/sessions/${id}`),

  messages: (id: string) => json<StoredMessage[]>(`/api/sessions/${id}/messages`),

  newSessionTitle: (id: string, title: string) =>
    json<SessionRow>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),

  updateSession: (id: string, patch: { title?: string; provider?: string; model?: string; projectDir?: string }) =>
    json<SessionRow>(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  generateSessionTitle: (id: string) =>
    json<SessionRow>(`/api/sessions/${id}/generate-title`, { method: "POST" }),

  pickFolderResult: (title?: string) =>
    json<{ path: string | null; cancelled?: boolean }>("/api/system/pick-folder", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  pickFolder: (title?: string) =>
    json<{ path: string | null; cancelled?: boolean }>("/api/system/pick-folder", {
      method: "POST",
      body: JSON.stringify({ title }),
    })
      .then((r) => r.path)
      .catch(() => null),

  deleteSession: (id: string) => json<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),

  saveKey: (provider: string, key: string) =>
    json(`/api/keys`, { method: "POST", body: JSON.stringify({ provider, key }) }),

  settings: () => json<KlodexSettings>(`/api/settings`),

  saveSettings: (patch: Partial<KlodexSettings>) =>
    json<KlodexSettings>(`/api/settings`, { method: "POST", body: JSON.stringify(patch) }),

  stop: (sessionId: string) =>
    json<{ ok: boolean }>(`/api/chat/stop`, { method: "POST", body: JSON.stringify({ sessionId }) }),

  updateStatus: () => json<UpdateStatus>(`/api/update/status`),

  checkUpdate: () => json<UpdateStatus>(`/api/update/check`, { method: "POST" }),

  // The updater answers with a structured { ok, log, message } body even when
  // the pull/build fails (HTTP 500). Read that body unconditionally, otherwise
  // the generic helper collapses a real diagnostic into "Сбой обновления: 500".
  applyUpdate: async () => {
    const res = await fetch("/api/update/apply", { method: "POST" });
    const body = (await res.json().catch(() => null)) as
      | { ok: boolean; log: string; message: string }
      | null;
    if (body) return body;
    throw new Error(`HTTP ${res.status}`);
  },

  restart: () => json<{ ok: boolean; message?: string }>(`/api/restart`, { method: "POST" }),

  health: () => json<{ ok: boolean; version?: string }>(`/api/health`),

  skillsCatalog: (projectDir?: string) =>
    json<CatalogResponse>(`/api/skills/catalog${projectDir ? `?projectDir=${encodeURIComponent(projectDir)}` : ""}`),

  slashCommands: (projectDir?: string) =>
    json<SlashCommand[]>(`/api/skills/slash-commands${projectDir ? `?projectDir=${encodeURIComponent(projectDir)}` : ""}`),

  installSkillOrPrompt: (type: "skill" | "prompt", id: string, path: string) =>
    json<{ ok: boolean; message?: string }>(`/api/skills/install`, {
      method: "POST",
      body: JSON.stringify({ type, id, path }),
    }),

  uninstallSkillOrPrompt: (type: "skill" | "prompt", id: string) =>
    json<{ ok: boolean }>(`/api/skills/uninstall`, {
      method: "POST",
      body: JSON.stringify({ type, id }),
    }),

  toggleSkillOrPrompt: (type: "skill" | "prompt", id: string, enabled: boolean) =>
    json<{ ok: boolean }>(`/api/skills/toggle`, {
      method: "POST",
      body: JSON.stringify({ type, id, enabled }),
    }),

  activeChat: (sessionId?: string) =>
    sessionId
      ? json<{ active: boolean; model?: string; provider?: string; startedAt?: number }>(
          `/api/chat/active?sessionId=${encodeURIComponent(sessionId)}`,
        ).catch(() => ({ active: false as const, model: undefined, provider: undefined, startedAt: undefined }))
      : json<{ activeSessionIds: string[] }>(`/api/chat/active`).catch(() => ({ activeSessionIds: [] })),
};

async function* readEventStream<T = AgentEvent>(res: Response): AsyncGenerator<T> {
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "stream failed");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        try {
          yield JSON.parse(data) as T;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}

export type ExplainSkillRequest = {
  name: string;
  kind?: string;
  promptType?: string;
  triggers?: string[];
  description?: string;
  content?: string;
  provider?: string;
  model?: string;
};

export type ExplainEvent =
  | { t: "delta"; text: string }
  | { t: "finish" }
  | { t: "error"; error: string };

/** POST /api/skills/explain and yield streaming explanation events. */
export async function* explainSkillStream(
  req: ExplainSkillRequest,
  signal?: AbortSignal,
): AsyncGenerator<ExplainEvent> {
  const res = await fetch("/api/skills/explain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  yield* readEventStream<ExplainEvent>(res);
}

/** POST /api/chat and yield AgentEvents from the SSE stream. */
export async function* chatStream(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  yield* readEventStream(res);
}

/** GET /api/chat/stream and yield replayed + live AgentEvents. */
export async function* chatStreamReconnect(sessionId: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch(`/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`, {
    method: "GET",
    signal,
  });
  yield* readEventStream(res);
}

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function formatCost(m: KlodexModel): string {
  if (m.free) return "free";
  if (m.costOutput == null) return "";
  return `$${m.costOutput}/Mtok out`;
}
