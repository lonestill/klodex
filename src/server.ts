import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  appendMessage,
  createSession,
  deleteSession,
  getMessages,
  getSession,
  listSessions,
  updateSessionMeta,
  type SessionRow,
} from "./store.ts";
import { getCatalog, invalidateCatalog, buildModel, clearFactories, parseModelKey, defaultModelKey } from "./providers.ts";
import { streamText } from "ai";
import { runAgent, buildSubagentTool, type AgentEvent } from "./agent.ts";
import { loadConfig, saveProviderKey, saveSettings, parseJsonc } from "./config.ts";
import { checkUpdates, applyUpdate, getCurrentVersion, startUpdateWatcher } from "./updater.ts";
import {
  getFullCatalog,
  getSlashCommands,
  installCatalogItem,
  uninstallCatalogItem,
  toggleCatalogItem,
  resolvePromptExecution,
  buildSkillsInstructions,
} from "./skills.ts";
import { pickNativeFolder } from "./dialog.ts";
import { computeEmbeddings } from "./embeddings.ts";

const sessions = new Map<string, SessionRow>();

function resident(id: string): SessionRow {
  const s = sessions.get(id) ?? getSession(id);
  if (!s) throw new Error("session not found");
  sessions.set(id, s);
  return s;
}

type ChatIn = { sessionId?: string; message: string; model?: string; reconnect?: boolean };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function body<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

function sseHeaders(): Record<string, string> {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  };
}

interface ActiveRun {
  sessionId: string;
  abort: AbortController;
  events: AgentEvent[];
  subscribers: Set<(evt: AgentEvent) => void>;
  startedAt: number;
  provider: string;
  model: string;
  done: boolean;
  userText: string;
  finishReason?: string;
  messageId?: string;
  error?: string;
}

const activeRuns = new Map<string, ActiveRun>();

function subscribeToActiveRun(run: ActiveRun): Response {
  const enc = new TextEncoder();
  let sub: ((evt: AgentEvent) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // 1. Replay all buffered events in order so refreshed page recovers full state
      for (const evt of run.events) {
        send(evt);
        if (closed) break;
      }

      if (run.done || closed) {
        try {
          controller.close();
        } catch {}
        return;
      }

      // 2. Subscribe to subsequent live events
      sub = (evt: AgentEvent) => {
        send(evt);
        if (evt.t === "finish" || evt.t === "error") {
          closed = true;
          if (sub) run.subscribers.delete(sub);
          try {
            controller.close();
          } catch {}
        }
      };
      run.subscribers.add(sub);
    },
    cancel() {
      if (sub) {
        run.subscribers.delete(sub);
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function handleAgentStream(session: SessionRow, rawUserText: string, modelKey?: string) {
  // If an active run already exists for this session and isn't done, attach to it
  const existing = activeRuns.get(session.id);
  if (existing && !existing.done) {
    return subscribeToActiveRun(existing);
  }

  // 1. Resolve slash command and prompt expansion (system / user / composite)
  const resolved = resolvePromptExecution(rawUserText, session.project_dir);
  const userText = resolved.finalUserText;

  // 2. Build active skills directives and keyword triggers
  const skillsInstructions = buildSkillsInstructions(session.project_dir, userText);
  const extraParts = [
    resolved.systemInjection ? `# Active Prompt Directives\n${resolved.systemInjection}` : "",
    skillsInstructions,
  ].filter(Boolean);
  const instructionsExtra = extraParts.length > 0 ? extraParts.join("\n\n") : undefined;

  const uid = crypto.randomUUID();
  appendMessage(session.id, crypto.randomUUID(), {
    id: uid,
    role: "user",
    parts: [{ type: "text", text: userText }],
  });

  const mk = modelKey
    ? parseModelKey(modelKey) ?? undefined
    : parseModelKey(`${session.provider ?? ""}/${session.model ?? ""}`) ?? undefined;

  const provider = mk?.provider ?? "";
  const model = mk?.model ?? "";

  const run: ActiveRun = {
    sessionId: session.id,
    abort: new AbortController(),
    events: [],
    subscribers: new Set(),
    startedAt: Date.now(),
    provider,
    model,
    done: false,
    userText,
  };
  activeRuns.set(session.id, run);

  // Run agent asynchronously in the background so browser refreshes / disconnects
  // do not cancel or drop the in-flight generation.
  (async () => {
    const broadcast = (e: AgentEvent) => {
      run.events.push(e);
      for (const sub of Array.from(run.subscribers)) {
        try {
          sub(e);
        } catch {}
      }
    };

    broadcast({ t: "start", provider, model } as any);
    try {
      const historyAfterUser = getMessages(session.id).map((m) => m.data);
      const res = await runAgent(
        {
          projectDir: session.project_dir,
          provider,
          model,
          history: historyAfterUser,
          sessionId: session.id,
          instructionsExtra,
        },
        {
          onEvent: broadcast,
          abort: run.abort.signal,
          subagentTool: buildSubagentTool({
            projectDir: session.project_dir,
            sessionId: session.id,
            currentProvider: provider,
            currentModel: model,
          }),
        },
      );
      appendMessage(session.id, res.message.id, res.message);
      run.messageId = res.message.id;
      run.finishReason = res.finishReason;
      broadcast({
        t: "finish",
        detail: { finishReason: res.finishReason, steps: res.steps, tokens: res.tokens },
        messageId: res.message.id,
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      run.error = msg;
      broadcast({ t: "error", message: msg });
    } finally {
      run.done = true;
      // Retain in activeRuns for 30s so late reconnections / page reloads around finish
      // can still replay the full event sequence before expiring.
      setTimeout(() => {
        if (activeRuns.get(session.id) === run) {
          activeRuns.delete(session.id);
        }
      }, 30_000);
    }
  })();

  return subscribeToActiveRun(run);
}

export function serve(port: number) {
  const cfg = loadConfig();

  // Poll GitHub/git for new commits once a minute so the UI can notify the user.
  startUpdateWatcher();

  const server = Bun.serve({
    port,
    idleTimeout: 255,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // ------- static web UI (vite build output) -------
      if (req.method === "GET" && !path.startsWith("/api/")) {
        const distDir = join(import.meta.dir, "..", "web-ui", "dist");
        const rel = path === "/" ? "index.html" : path.replace(/^\/web\//, "").replace(/^\//, "");
        const fp = join(distDir, rel);
        if (existsSync(fp)) {
          const type =
            fp.endsWith(".html") ? "text/html; charset=utf-8"
            : fp.endsWith(".js") ? "text/javascript; charset=utf-8"
            : fp.endsWith(".css") ? "text/css; charset=utf-8"
            : fp.endsWith(".svg") ? "image/svg+xml"
            : fp.endsWith(".png") ? "image/png"
            : fp.endsWith(".jpg") || fp.endsWith(".jpeg") ? "image/jpeg"
            : fp.endsWith(".ico") ? "image/x-icon"
            : fp.endsWith(".woff2") ? "font/woff2"
            : fp.endsWith(".map") ? "application/json"
            : "application/octet-stream";
          return new Response(Bun.file(fp), { headers: { "content-type": type } });
        }
        // SPA fallback to index.html
        const indexPath = join(distDir, "index.html");
        if (existsSync(indexPath)) {
          return new Response(Bun.file(indexPath), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      }


      // ------- catalog -------
      if (path === "/api/catalog") {
        const cat = await getCatalog();
        return json({
          providers: cat.providers.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            hasKey: p.hasKey,
            note: p.note,
            baseURL: p.baseURL,
            npm: p.npm,
            category: p.category,
            freeCount: p.freeCount ?? 0,
            total: p.total ?? p.models.length,
            models: p.models.map((m) => ({
              id: m.id,
              name: m.name,
              reasoning: m.reasoning ?? false,
              toolCall: m.toolCall,
              contextWindow: m.contextWindow,
              costInput: m.costInput,
              costOutput: m.costOutput,
              free: m.free ?? false,
              deprecated: m.deprecated ?? false,
            })),
          })),
        });
      }

      if (path === "/api/catalog/refresh") {
        invalidateCatalog();
        clearFactories();
        const cat = await getCatalog();
        return json({ ok: true, providers: cat.providers.length });
      }

      if (path === "/api/keys") {
        const cfg2 = loadConfig();
        if (req.method === "POST") {
          const b = await body<{ provider: string; key: string }>(req);
          if (!b.provider || !b.key) return json({ error: "provider and key required" }, 400);
          saveProviderKey(b.provider, b.key);
          invalidateCatalog();
          clearFactories();
        }
        const cat = await getCatalog();
        return json(
          cat.providers.map((p) => ({ provider: p.id, hasKey: p.hasKey, status: p.status })),
        );
      }

      // ------- settings -------
      if (path === "/api/settings" && req.method === "POST") {
        const b = await body<{
          defaultProvider?: string;
          defaultModel?: string;
          maxSteps?: number;
          maxSubagentSteps?: number;
          systemPrompt?: string;
          providerSort?: "category" | "alpha" | "models";
          subagentModels?: { explore?: string; general?: string };
        }>(req);
        const cfgSaved = saveSettings(b);
        if (b.providerSort !== undefined) {
          invalidateCatalog();
          clearFactories();
        }
        return json({
          defaultProvider: cfgSaved.defaultProvider,
          defaultModel: cfgSaved.defaultModel,
          maxSteps: cfgSaved.maxSteps,
          maxSubagentSteps: cfgSaved.maxSubagentSteps,
          systemPrompt: cfgSaved.systemPrompt,
          providerSort: cfgSaved.providerSort ?? "category",
          subagentModels: cfgSaved.subagentModels ?? {},
          firstRunCompleted: cfgSaved.firstRunCompleted ?? false,
          updateRepo: cfgSaved.updateRepo ?? "lonestill/klodex",
          version: getCurrentVersion(),
        });
      }

      if (path === "/api/settings" && req.method === "GET") {
        const cfgSaved = loadConfig();
        return json({
          defaultProvider: cfgSaved.defaultProvider,
          defaultModel: cfgSaved.defaultModel,
          maxSteps: cfgSaved.maxSteps,
          maxSubagentSteps: cfgSaved.maxSubagentSteps,
          systemPrompt: cfgSaved.systemPrompt,
          providerSort: cfgSaved.providerSort ?? "category",
          subagentModels: cfgSaved.subagentModels ?? {},
          firstRunCompleted: cfgSaved.firstRunCompleted ?? false,
          updateRepo: cfgSaved.updateRepo ?? "lonestill/klodex",
          version: getCurrentVersion(),
        });
      }

      // ------- auto-updater -------
      if (path === "/api/update/status" && req.method === "GET") {
        const status = await checkUpdates(false);
        return json(status);
      }

      if (path === "/api/update/check" && req.method === "POST") {
        const status = await checkUpdates(true);
        return json(status);
      }

      if (path === "/api/update/apply" && req.method === "POST") {
        const res = await applyUpdate();
        return json(res, res.ok ? 200 : 500);
      }

      // ------- skills & prompts catalog -------
      if (path === "/api/skills/catalog" && req.method === "GET") {
        const projectDir = url.searchParams.get("projectDir") || undefined;
        const catalog = await getFullCatalog(projectDir);
        return json(catalog);
      }

      if (path === "/api/skills/slash-commands" && req.method === "GET") {
        const projectDir = url.searchParams.get("projectDir") || undefined;
        return json(getSlashCommands(projectDir));
      }

      if (path === "/api/skills/install" && req.method === "POST") {
        const b = await body<{ type: "skill" | "prompt"; id: string; path: string }>(req);
        if (!b.id || !b.path || !b.type) return json({ error: "type, id and path required" }, 400);
        const res = await installCatalogItem(b.type, b.id, b.path);
        return json(res, res.ok ? 200 : 500);
      }

      if (path === "/api/skills/uninstall" && req.method === "POST") {
        const b = await body<{ type: "skill" | "prompt"; id: string }>(req);
        if (!b.id || !b.type) return json({ error: "type and id required" }, 400);
        const res = uninstallCatalogItem(b.type, b.id);
        return json(res);
      }

      if (path === "/api/skills/toggle" && req.method === "POST") {
        const b = await body<{ type: "skill" | "prompt"; id: string; enabled: boolean }>(req);
        if (!b.id || !b.type || typeof b.enabled !== "boolean") {
          return json({ error: "type, id and enabled boolean required" }, 400);
        }
        const res = toggleCatalogItem(b.type, b.id, b.enabled);
        return json(res);
      }

      if (path === "/api/skills/explain" && req.method === "POST") {
        const b = await body<{
          name: string;
          kind?: string;
          promptType?: string;
          triggers?: string[];
          description?: string;
          content?: string;
          provider?: string;
          model?: string;
        }>(req);

        let provider = b.provider;
        let modelId = b.model;

        if (!provider || !modelId) {
          const def = defaultModelKey();
          const parsed = parseModelKey(def);
          provider = provider || parsed?.provider || "deepai";
          modelId = modelId || parsed?.model || "deepseek-v3.2";
        }

        try {
          const model = await buildModel(provider, modelId);

          const system = [
            "Ты — опытный AI-инженер и архитектор в Klodex.",
            "Пользователь изучает скилл или промпт из каталога расширений.",
            "Твоя задача — дать глубокий, предельно практичный, структурированный и понятный разбор без воды.",
            "Категорический запрет на любые эмодзи. Пиши строго в техническом стиле без пиктограмм и украшательств.",
            "Форматируй ответ в строгом Markdown: четкие заголовки (h3), маркированные списки, выделения ключевых терминов, блоки кода для примеров.",
            "Структура ответа:",
            "### Назначение и суть",
            "Что конкретно делает этот инструмент, какую проблему решает и какую практическую пользу приносит.",
            "",
            "### Триггеры и активация",
            "Как и когда он запускается: автоматические ключевые фразы/триггеры, ручной вызов через slash-команду, постоянная системная директива или комбинированный режим.",
            "",
            "### Примеры использования в бою",
            "2-3 конкретных сценария из реальной практики разработчика (запрос пользователя -> как скилл/промпт отрабатывает).",
            "",
            "### Рекомендации и нюансы",
            "С какими моделями (Sonnet, Opus, GPT-4o, DeepSeek) лучше работает, есть ли ограничения, где его лучше НЕ применять.",
          ].join("\n");

          const userPrompt = [
            `Разбери следующий компонент каталога:`,
            `• Название: ${b.name}`,
            `• Тип: ${b.kind || "skill"}${b.promptType ? ` (${b.promptType})` : ""}`,
            b.triggers && b.triggers.length > 0 ? `• Триггеры: ${b.triggers.join(", ")}` : "",
            b.description ? `• Описание: ${b.description}` : "",
            b.content
              ? `\n### Исходный код / инструкции компонента:\n\`\`\`markdown\n${b.content.slice(0, 15000)}\n\`\`\``
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          const res = streamText({
            model,
            instructions: system,
            prompt: userPrompt,
            abortSignal: req.signal,
            maxRetries: 2,
          });

          const enc = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of res.textStream) {
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "delta", text: chunk })}\n\n`));
                }
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "finish" })}\n\n`));
              } catch (err: any) {
                const msg = err?.message ?? String(err);
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "error", error: msg })}\n\n`));
              } finally {
                try {
                  controller.close();
                } catch {}
              }
            },
          });

          return new Response(stream, { headers: sseHeaders() });
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          return json({ error: msg }, 500);
        }
      }

      if (path === "/api/system/pick-folder" && req.method === "POST") {
        const b = (await body<{ title?: string }>(req).catch(() => ({}))) as { title?: string };
        const res = await pickNativeFolder(b.title || "Выбери папку проекта");
        return json(res);
      }

      // ------- sessions -------
      if (path === "/api/sessions" && req.method === "GET") return json(listSessions());

      if (path === "/api/sessions" && req.method === "POST") {
        const b = await body<{ projectDir?: string; model?: string; provider?: string }>(req);
        let dir = b.projectDir?.trim() || process.cwd();
        try {
          dir = resolve(dir);
        } catch {}
        const s = createSession({ projectDir: dir, provider: b.provider, model: b.model, title: "New session" });
        sessions.set(s.id, s);
        return json(s);
      }

      if (path.startsWith("/api/sessions/")) {
        const id = path.split("/")[3];
        if (!id) return json({ error: "session id required" }, 400);
        const s = getSession(id);
        if (!s) return json({ error: "not found" }, 404);

        if (req.method === "GET" && path.endsWith("/messages")) {
          return json(getMessages(id));
        }
        if (req.method === "DELETE") {
          deleteSession(id);
          sessions.delete(id);
          return json({ ok: true });
        }
        if (req.method === "PATCH") {
          const b = await body<{ title?: string; provider?: string; model?: string; projectDir?: string }>(req);
          updateSessionMeta(id, b);
          const ns = getSession(id)!;
          sessions.set(id, ns);
          return json(ns);
        }
        if (req.method === "GET") return json(s);
      }

      // ------- chat (SSE) -------
      if (path === "/api/chat/active" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        if (sessionId) {
          const run = activeRuns.get(sessionId);
          return json({
            active: Boolean(run && !run.done),
            provider: run?.provider,
            model: run?.model,
            startedAt: run?.startedAt,
          });
        }
        const activeIds = Array.from(activeRuns.entries())
          .filter(([_, r]) => !r.done)
          .map(([id]) => id);
        return json({ activeSessionIds: activeIds });
      }

      if (path === "/api/chat/stream" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        const run = sessionId ? activeRuns.get(sessionId) : null;
        if (run) {
          return subscribeToActiveRun(run);
        }
        return json({ error: "no active run for this session" }, 404);
      }

      if (path === "/api/chat" && req.method === "POST") {
        const b = await body<ChatIn>(req);
        const session = b.sessionId ? (sessions.get(b.sessionId) ?? getSession(b.sessionId)) : undefined;
        if (!session) return json({ error: "invalid sessionId" }, 400);
        sessions.set(session.id, session);
        if (b.reconnect) {
          const run = activeRuns.get(session.id);
          if (run) return subscribeToActiveRun(run);
          return json({ error: "no active run for this session" }, 404);
        }
        if (!b.message?.trim()) return json({ error: "empty message" }, 400);
        return handleAgentStream(session, b.message, b.model);
      }

      if (path === "/api/chat/stop" && req.method === "POST") {
        const b = await body<{ sessionId: string }>(req);
        const run = activeRuns.get(b.sessionId);
        if (run && !run.done) {
          run.abort.abort();
          return json({ ok: true });
        }
        return json({ ok: false });
      }

      if (path === "/api/embeddings" && req.method === "POST") {
        try {
          const b = await body<{ input: string | string[]; model?: string }>(req);
          if (!b.input) return json({ error: "input field is required" }, 400);
          const texts = Array.isArray(b.input) ? b.input : [b.input];
          const result = await computeEmbeddings(texts);
          return json({
            object: "list",
            data: result.vectors.map((vec, idx) => ({
              object: "embedding",
              index: idx,
              embedding: vec,
            })),
            model: b.model || "BAAI/bge-small-en-v1.5",
            usage: {
              prompt_tokens: texts.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0),
              total_tokens: texts.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0),
            },
          });
        } catch (err: any) {
          return json({ error: err.message || "Embedding generation failed" }, 500);
        }
      }

      if (path === "/api/generate-image") {
        try {
          let prompt = "";
          let model = "flux";
          let width = 1024;
          let height = 1024;
          let seed: number | undefined;

          if (req.method === "POST") {
            const b = await body<{ prompt: string; model?: string; width?: number; height?: number; seed?: number }>(req);
            prompt = b.prompt;
            if (b.model) model = b.model;
            if (b.width) width = b.width;
            if (b.height) height = b.height;
            if (b.seed) seed = b.seed;
          } else {
            prompt = url.searchParams.get("prompt") || "";
            if (url.searchParams.has("model")) model = url.searchParams.get("model")!;
            if (url.searchParams.has("width")) width = Number(url.searchParams.get("width")) || 1024;
            if (url.searchParams.has("height")) height = Number(url.searchParams.get("height")) || 1024;
            if (url.searchParams.has("seed")) seed = Number(url.searchParams.get("seed")) || undefined;
          }

          if (!prompt?.trim()) return json({ error: "prompt is required" }, 400);

          let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${width}&height=${height}`;
          if (seed !== undefined) imageUrl += `&seed=${seed}`;

          const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
          if (!imgRes.ok) {
            return json({ error: `Pollinations image API returned HTTP ${imgRes.status}` }, 502);
          }

          const buf = await imgRes.arrayBuffer();
          const format = url.searchParams.get("format") || req.headers.get("accept");

          if (format?.includes("application/json")) {
            const b64 = Buffer.from(buf).toString("base64");
            return json({
              created: Math.floor(Date.now() / 1000),
              data: [{ b64_json: b64, url: imageUrl }],
            });
          }

          return new Response(buf, {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
              "cache-control": "public, max-age=86400",
            },
          });
        } catch (err: any) {
          return json({ error: err.message || "Image generation failed" }, 500);
        }
      }

      if (path === "/api/health") return json({ ok: true, version: getCurrentVersion() });

      return json({ error: "not found" }, 404);
    },
  });

  return server;
}
