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
import { getCatalog, invalidateCatalog, buildModel, clearFactories, parseModelKey } from "./providers.ts";
import { runAgent, buildSubagentTool } from "./agent.ts";
import { loadConfig, saveProviderKey, saveSettings, parseJsonc } from "./config.ts";
import { checkUpdates, applyUpdate, getCurrentVersion } from "./updater.ts";
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

const sessions = new Map<string, SessionRow>();

function resident(id: string): SessionRow {
  const s = sessions.get(id) ?? getSession(id);
  if (!s) throw new Error("session not found");
  sessions.set(id, s);
  return s;
}

type ChatIn = { sessionId?: string; message: string; model?: string };

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

const runs = new Map<string, AbortController>();

function handleAgentStream(session: SessionRow, rawUserText: string, modelKey?: string) {
  const cfg = loadConfig();

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

  const history = getMessages(session.id).map((m) => m.data);
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
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const abort = new AbortController();
      runs.set(session.id, abort);
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send({ t: "start", provider, model });
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
            onEvent: (e) => send(e),
            abort: abort.signal,
            subagentTool: buildSubagentTool({
              projectDir: session.project_dir,
              sessionId: session.id,
              currentProvider: provider,
              currentModel: model,
            }),
          },
        );
        appendMessage(session.id, res.message.id, res.message);
        send({
          t: "finish",
          detail: { finishReason: res.finishReason, steps: res.steps, tokens: res.tokens },
          messageId: res.message.id,
        });
      } catch (e: any) {
        send({ t: "error", message: e?.message ?? String(e) });
      } finally {
        runs.delete(session.id);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

export function serve(port: number) {
  const cfg = loadConfig();

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
      if (path === "/api/chat" && req.method === "POST") {
        const b = await body<ChatIn>(req);
        const session = b.sessionId ? (sessions.get(b.sessionId) ?? getSession(b.sessionId)) : undefined;
        if (!session) return json({ error: "invalid sessionId" }, 400);
        sessions.set(session.id, session);
        if (!b.message?.trim()) return json({ error: "empty message" }, 400);
        return handleAgentStream(session, b.message, b.model);
      }

      if (path === "/api/chat/stop" && req.method === "POST") {
        const b = await body<{ sessionId: string }>(req);
        const a = runs.get(b.sessionId);
        if (a) {
          a.abort();
          runs.delete(b.sessionId);
          return json({ ok: true });
        }
        return json({ ok: false });
      }

      if (path === "/api/health") return json({ ok: true, version: getCurrentVersion() });

      return json({ error: "not found" }, 404);
    },
  });

  return server;
}
