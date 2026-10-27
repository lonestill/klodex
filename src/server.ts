import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import {
  appendMessage,
  createSession,
  deleteSession,
  getMessages,
  getContextMessages,
  hasSessionContext,
  getProjectMemory,
  getSession,
  listSessions,
  updateSessionMeta,
  compactSessionMessages,
  recordTokenUsage,
  getSessionTokenStats,
  getFullTokenStats,
  clearTokenUsage,
  type SessionRow,
} from "./store.ts";
import { getCatalog, invalidateCatalog, buildModel, clearFactories, parseModelKey, defaultModelKey } from "./providers.ts";
import { streamText } from "ai";
import { runAgent, buildSubagentTool, type AgentEvent } from "./agent.ts";
import {
  loadConfig,
  saveProviderKey,
  saveProviderOptions,
  saveSettings,
  parseJsonc,
  saveTagflowAccount,
  listTagflowAccounts,
  switchTagflowAccount,
  deleteTagflowAccount,
} from "./config.ts";
import { generateTitleWithModel } from "./title.ts";
import { checkUpdates, applyUpdate, getCurrentVersion, startUpdateWatcher } from "./updater.ts";
import { getChangelog } from "./changelog.ts";
import { restartServer, terminateAllOtherKlodexInstances } from "./instance.ts";
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
import { createTagflowAutoAccount, fetchTagflowUsage, clearTagflowTokenCache } from "./adcode.ts";
import { workspaceApi } from "./workspace-api.ts";
import { newRun, saveRun, listRuns, getRun, recoverRuns, recordEvent, recoveryContext, type Run } from "./runs.ts";
import { snapshot } from "./workspace.ts";
import { repository } from "./workspace.ts";
import { compactContext } from "./context.ts";
import { screenshotPath, screenshotContext } from "./preview.ts";

const sessions = new Map<string, SessionRow>();

function resident(id: string): SessionRow {
  const s = sessions.get(id) ?? getSession(id);
  if (!s) throw new Error("session not found");
  sessions.set(id, s);
  return s;
}

type ChatIn = { sessionId?: string; message: string; model?: string; reconnect?: boolean; screenshots?: string[] };

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

export { restartServer };


interface ActiveRun {
  durable: Run;
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

function handleAgentStream(session: SessionRow, rawUserText: string, modelKey?: string, queued?: Run, screenshots: string[] = []) {
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
    parts: [{ type: "text", text: [userText, ...screenshots.map(screenshotContext)].filter(Boolean).join("\n\n") }, ...screenshots.map(id => ({ type: "file", mediaType: "image/png", url: `data:image/png;base64,${readFileSync(screenshotPath(id)).toString("base64")}` }))],
  });

  const mk = modelKey
    ? parseModelKey(modelKey) ?? undefined
    : parseModelKey(`${session.provider ?? ""}/${session.model ?? ""}`) ?? undefined;

  const provider = mk?.provider ?? "";
  const model = mk?.model ?? "";

  const run: ActiveRun = {
    durable: queued ?? newRun({ sessionId: session.id, projectDir: session.project_dir, prompt: rawUserText, model: `${provider}/${model}` }),
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
      if (e.t !== "status") recordEvent(run.durable.id, e);
      run.events.push(e);
      for (const sub of Array.from(run.subscribers)) {
        try {
          sub(e);
        } catch {}
      }
    };

    broadcast({ t: "start", provider, model } as any);

    // Auto-generate title using the active selected model
    const needsTitle = !session.title || session.title === "New session" || session.title === "Новая сессия" || session.title === "Сессия Klodex";
    if (needsTitle) {
      (async () => {
        try {
          const genTitle = await generateTitleWithModel(userText, { provider, model }, session.project_dir);
          if (genTitle) {
            updateSessionMeta(session.id, { title: genTitle });
            session.title = genTitle;
            const resSession = sessions.get(session.id);
            if (resSession) resSession.title = genTitle;
            broadcast({ t: "title", title: genTitle });
          }
        } catch (err) {
          console.error("Auto title generation error:", err);
        }
      })();
    }
    try {
      run.durable.state = "running";
      try { run.durable.before = snapshot(session.project_dir, `${run.durable.id}-before`); }
      catch { run.durable.error = "Git checkpoint unavailable for this project"; }
      saveRun(run.durable);
      const historyAfterUser = getContextMessages(session.id).map((m) => m.data);
      const res = await runAgent(
        {
          projectDir: session.project_dir,
          provider,
          model,
          history: historyAfterUser,
          sessionId: session.id,
          instructionsExtra: [instructionsExtra, getProjectMemory(session.project_dir) ? `# Project memory\n${getProjectMemory(session.project_dir)}` : ""].filter(Boolean).join("\n\n"),
        },
        {
          onEvent: broadcast,
          abort: run.abort.signal,
          subagentTool: buildSubagentTool({
            projectDir: session.project_dir,
            sessionId: session.id,
            currentProvider: provider,
            currentModel: model,
            signal: run.abort.signal,
          }),
        },
      );
      (res.message as any).usage = {
        promptTokens: res.promptTokens ?? 0,
        completionTokens: res.completionTokens ?? 0,
        totalTokens: res.tokens ?? 0,
        durationMs: res.durationMs ?? 0,
      };
      (res.message as any).model = `${provider}/${model}`;
      appendMessage(session.id, res.message.id, res.message);

      try {
        recordTokenUsage({
          sessionId: session.id,
          messageId: res.message.id,
          provider,
          model,
          promptTokens: res.promptTokens ?? 0,
          completionTokens: res.completionTokens ?? 0,
          totalTokens: res.tokens ?? 0,
          durationMs: res.durationMs ?? 0,
        });
      } catch (err) {
        console.error("Failed to record token usage:", err);
      }

      run.messageId = res.message.id;
      run.finishReason = res.finishReason;
      run.durable.state = run.abort.signal.aborted || res.finishReason === "abort" ? "cancelled" : res.finishReason === "rate_limit" || res.finishReason === "unknown" ? "interrupted" : "completed";
      broadcast({
        t: "finish",
        detail: {
          finishReason: res.finishReason,
          steps: res.steps,
          tokens: res.tokens,
          promptTokens: res.promptTokens,
          completionTokens: res.completionTokens,
          durationMs: res.durationMs,
        },
        messageId: res.message.id,
      });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      run.error = msg;
      run.durable.state = run.abort.signal.aborted ? "cancelled" : "failed";
      run.durable.error = msg;
      broadcast({ t: "error", message: msg });
    } finally {
      if (run.durable.before) {
        try { run.durable.after = snapshot(session.project_dir, `${run.durable.id}-after`); } catch (error) { run.durable.error = `Final checkpoint failed: ${error}`; }
      }
      saveRun(run.durable);
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

function killStaleKlodexOnPort(port: number): void {
  try {
    terminateAllOtherKlodexInstances(process.pid, port);
  } catch {}
}

export function serve(preferredPort: number) {
  const cfg = loadConfig();
  recoverRuns();
  const projectKey = (dir: string) => { try { return repository(dir); } catch { return resolve(dir); } };
  const projectBusy = (dir: string) => Array.from(activeRuns.values()).some(run => !run.done && projectKey(run.durable.projectDir) === projectKey(dir));
  const queueTimer = setInterval(() => {
    for (const run of listRuns().reverse()) {
      if (run.state !== "queued" || projectBusy(run.projectDir)) continue;
      const session = getSession(run.sessionId);
      if (!session) { saveRun({ ...run, state: "cancelled", error: "Session deleted" }); continue; }
      try { handleAgentStream({ ...session, project_dir: run.projectDir }, run.prompt, run.model, run).body?.cancel(); }
      catch (error) { saveRun({ ...run, state: "failed", error: String(error) }); }
    }
  }, 1000);
  queueTimer.unref();

  // Poll GitHub/git for new commits once a minute so the UI can notify the user.
  startUpdateWatcher();

  killStaleKlodexOnPort(preferredPort);

  let activePort = preferredPort;
  let server: any;

  const createHandler = () => async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const path = url.pathname;
      const workspaceResponse = await workspaceApi(req, projectBusy);
      if (workspaceResponse) return workspaceResponse;
      if (path === "/api/chat/resume" && req.method === "POST") {
        const { runId } = await body<{ runId: string }>(req);
        const old = getRun(runId);
        if (!old || !["interrupted", "failed", "cancelled"].includes(old.state)) return json({ error: "Run cannot be resumed" }, 409);
        if (listRuns(old.sessionId).some(run => run.parentId === old.id && ["queued", "running"].includes(run.state))) return json({ error: "Continuation is already queued or running" }, 409);
        const resumed = newRun({ sessionId: old.sessionId, projectDir: old.projectDir, prompt: recoveryContext(old), model: old.model, parentId: old.id });
        return json(resumed);
      }

      // ------- static web UI (vite build output) -------
      if (req.method === "GET" && !path.startsWith("/api/")) {
        const distDir =
          process.env.KLODEX_DIST_DIR ||
          (existsSync(join(import.meta.dir, "..", "web-ui", "dist"))
            ? join(import.meta.dir, "..", "web-ui", "dist")
            : existsSync(join(dirname(process.execPath), "..", "Resources", "dist"))
              ? join(dirname(process.execPath), "..", "Resources", "dist")
              : existsSync(join(dirname(process.execPath), "dist"))
                ? join(dirname(process.execPath), "dist")
                : join(import.meta.dir, "..", "web-ui", "dist"));
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
      if (path === "/api/catalog" || path === "/api/catalog/refresh") {
        if (path === "/api/catalog/refresh") {
          invalidateCatalog();
          clearFactories();
        }
        const cat = await getCatalog();
        return json({
          ok: true,
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

      // ------- provider custom options (Base URL / Endpoints) -------
      if (path === "/api/provider/options" && req.method === "POST") {
        const b = await body<{ provider: string; baseURL?: string }>(req);
        if (!b.provider) return json({ error: "provider required" }, 400);
        saveProviderOptions(b.provider, { baseURL: b.baseURL });
        invalidateCatalog();
        clearFactories();
        return json({ ok: true, provider: b.provider, baseURL: b.baseURL });
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
          subagentModels?: { explore?: string; general?: string; coder?: string; tester?: string };
          importOpenCode?: boolean;
          autoCheckUpdates?: boolean;
        }>(req);
        const cfgSaved = saveSettings(b);
        if (b.providerSort !== undefined || b.importOpenCode !== undefined) {
          invalidateCatalog();
          clearFactories();
        }
        return json({
          defaultProvider: cfgSaved.defaultProvider,
          defaultModel: cfgSaved.defaultModel,
          maxSteps: cfgSaved.maxSteps,
          maxSubagentSteps: cfgSaved.maxSubagentSteps ?? 32,
          systemPrompt: cfgSaved.systemPrompt,
          providerSort: cfgSaved.providerSort ?? "category",
          subagentModels: cfgSaved.subagentModels ?? {},
          importOpenCode: cfgSaved.importOpenCode ?? true,
          autoCheckUpdates: cfgSaved.autoCheckUpdates ?? true,
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
          maxSubagentSteps: cfgSaved.maxSubagentSteps ?? 32,
          systemPrompt: cfgSaved.systemPrompt,
          providerSort: cfgSaved.providerSort ?? "category",
          subagentModels: cfgSaved.subagentModels ?? {},
          importOpenCode: cfgSaved.importOpenCode ?? true,
          autoCheckUpdates: cfgSaved.autoCheckUpdates ?? true,
          firstRunCompleted: cfgSaved.firstRunCompleted ?? false,
          updateRepo: cfgSaved.updateRepo ?? "lonestill/klodex",
          version: getCurrentVersion(),
        });
      }

      // ------- ADCode 1-click registration & auth -------
      if (path === "/api/adcode/auth" && req.method === "POST") {
        const b = await body<{
          action: "register" | "login" | "reset_password";
          email: string;
          password?: string;
        }>(req);

        if (!b.email || !b.email.includes("@")) {
          return json({ error: "Укажи корректный email" }, 400);
        }

        const FIREBASE_KEY = "AIzaSyATZzX5Fw2HjR34VxB3UQWTmljprA5uXqE";

        if (b.action === "reset_password") {
          try {
            const res = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestType: "PASSWORD_RESET", email: b.email.trim() }),
                signal: AbortSignal.timeout(8000),
              },
            );
            const data = (await res.json()) as any;
            if (!res.ok) {
              return json({ error: data?.error?.message || "Ошибка отправки письма" }, 400);
            }
            return json({ ok: true, message: `Ссылка для сброса пароля отправлена на ${b.email}` });
          } catch (e: any) {
            return json({ error: e?.message || "Сетевой сбой при отправке письма" }, 500);
          }
        }

        if (!b.password || b.password.length < 6) {
          return json({ error: "Пароль должен содержать минимум 6 символов" }, 400);
        }

        if (b.action === "register") {
          try {
            const res = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: b.email.trim(),
                  password: b.password.trim(),
                  returnSecureToken: true,
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            const data = (await res.json()) as any;
            if (!res.ok) {
              const msg = data?.error?.message;
              if (msg === "EMAIL_EXISTS") {
                return json(
                  { error: "Этот email уже зарегистрирован в ADCode. Переключись на вкладку «Войти»." },
                  400,
                );
              }
              return json({ error: msg || "Ошибка регистрации в ADCode" }, 400);
            }

            // Immediately send verification email
            if (data.idToken) {
              await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_KEY}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: data.idToken }),
                  signal: AbortSignal.timeout(6000),
                },
              ).catch(() => {});
            }

            saveProviderKey("tagflow", `${b.email.trim()}:${b.password.trim()}`);
            invalidateCatalog();
            clearFactories();

            return json({
              ok: true,
              registered: true,
              email: b.email.trim(),
              message: `Аккаунт создан! Письмо с подтверждением отправлено на ${b.email.trim()}. Перейди по ссылке в письме для активации 1,000,000 токенов/день.`,
            });
          } catch (e: any) {
            return json({ error: e?.message || "Сбой при регистрации" }, 500);
          }
        }

        if (b.action === "login") {
          try {
            const res = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: b.email.trim(),
                  password: b.password.trim(),
                  returnSecureToken: true,
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            const data = (await res.json()) as any;
            if (!res.ok) {
              const msg = data?.error?.message;
              if (msg === "INVALID_LOGIN_CREDENTIALS") {
                return json(
                  { error: "Неверный пароль. Нажми «Забыли пароль?», если нужно сбросить." },
                  400,
                );
              }
              if (msg === "EMAIL_NOT_FOUND") {
                return json(
                  { error: "Аккаунт с таким email не найден. Переключись на вкладку «Создать аккаунт»." },
                  400,
                );
              }
              return json({ error: msg || "Ошибка входа" }, 400);
            }

            let emailVerified = false;
            if (data.idToken) {
              try {
                const claims = JSON.parse(
                  Buffer.from(data.idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
                ) as any;
                emailVerified = claims.email_verified === true;
              } catch {}

              if (!emailVerified) {
                fetch(
                  `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_KEY}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: data.idToken }),
                    signal: AbortSignal.timeout(6000),
                  },
                ).catch(() => {});
              }
            }

            saveProviderKey("tagflow", `${b.email.trim()}:${b.password.trim()}`);
            invalidateCatalog();
            clearFactories();

            return json({
              ok: true,
              emailVerified,
              message: emailVerified
                ? "Успешный вход! Доступ к моделям ADCode активен."
                : `Вход выполнен, но почта ${b.email} ещё не подтверждена. Проверь входящие письма от ADCode.`,
            });
          } catch (e: any) {
            return json({ error: e?.message || "Сбой при входе" }, 500);
          }
        }

        return json({ error: "Неизвестное действие" }, 400);
      }

      // ------- ADCode Instant Auto-Account (mail.tm disposable email + auto-verification) -------
      if (path === "/api/adcode/auto-account" && req.method === "POST") {
        const acceptHeader = req.headers.get("accept") || "";
        const isSse = acceptHeader.includes("text/event-stream");
        const oldActiveEmail = listTagflowAccounts().activeEmail;

        if (isSse) {
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              const sendStep = (step: string) => {
                try {
                  controller.enqueue(enc.encode(`data: ${JSON.stringify({ step })}\n\n`));
                } catch {}
              };

              try {
                const acc = await createTagflowAutoAccount(sendStep);

                // Auto-delete previous exhausted account from pool
                if (oldActiveEmail && oldActiveEmail.toLowerCase() !== acc.email.toLowerCase()) {
                  sendStep(`Удаление старого аккаунта (${oldActiveEmail})…`);
                  try {
                    deleteTagflowAccount(oldActiveEmail);
                  } catch (e) {
                    console.error("[tagflow] Failed to delete old account:", e);
                  }
                }

                clearTagflowTokenCache();
                invalidateCatalog();
                clearFactories();

                sendStep("Готово! Аккаунт активирован (+2,000,000 токенов/день)");
                controller.enqueue(
                  enc.encode(
                    `data: ${JSON.stringify({
                      ok: true,
                      email: acc.email,
                      removedOldEmail: oldActiveEmail,
                      active: true,
                    })}\n\n`,
                  ),
                );
                controller.close();
              } catch (err: any) {
                controller.enqueue(
                  enc.encode(
                    `data: ${JSON.stringify({
                      error: err?.message || "Не удалось создать авто-аккаунт",
                    })}\n\n`,
                  ),
                );
                controller.close();
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        // Standard JSON handler fallback
        try {
          const acc = await createTagflowAutoAccount();
          if (oldActiveEmail && oldActiveEmail.toLowerCase() !== acc.email.toLowerCase()) {
            try {
              deleteTagflowAccount(oldActiveEmail);
            } catch {}
          }
          clearTagflowTokenCache();
          invalidateCatalog();
          clearFactories();

          return json({
            ok: true,
            email: acc.email,
            password: acc.password,
            verified: true,
            active: true,
            removedOldEmail: oldActiveEmail,
            message: "Новый аккаунт создан и активирован. Старый удалён. +2,000,000 токенов/день.",
          });
        } catch (err: any) {
          return json({ error: err?.message || "Не удалось создать авто-аккаунт" }, 500);
        }
      }

      // ------- ADCode Token Usage Tracking -------
      if (path === "/api/adcode/usage" && req.method === "GET") {
        try {
          const usage = await fetchTagflowUsage();
          return json(usage);
        } catch (err: any) {
          return json({ ok: false, error: err?.message || "Сбой при получении статистики токенов ADCode" }, 500);
        }
      }

      // ------- ADCode Accounts Pool & Switcher -------
      if (path === "/api/adcode/accounts" && req.method === "GET") {
        return json(listTagflowAccounts());
      }

      if (path === "/api/adcode/switch" && req.method === "POST") {
        const b = await body<{ email: string }>(req);
        if (!b.email) return json({ error: "Email required" }, 400);
        const ok = switchTagflowAccount(b.email);
        if (!ok) return json({ error: "Аккаунт не найден в пуле" }, 404);
        clearTagflowTokenCache();
        invalidateCatalog();
        clearFactories();
        return json({ ok: true, activeEmail: b.email });
      }

      if (path === "/api/adcode/accounts" && req.method === "DELETE") {
        const b = await body<{ email: string }>(req);
        if (!b.email) return json({ error: "Email required" }, 400);
        deleteTagflowAccount(b.email);
        clearTagflowTokenCache();
        invalidateCatalog();
        clearFactories();
        return json({ ok: true });
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

      if (path === "/api/changelog" && req.method === "GET") {
        return json(await getChangelog());
      }

      if (path === "/api/update/apply" && req.method === "POST") {
        const res = await applyUpdate();
        if (res.ok) {
          // Restart backend server after short delay to let response reach client
          setTimeout(() => {
            restartServer(server, activePort);
          }, 600);
        }
        return json(res, res.ok ? 200 : 500);
      }

      if (path === "/api/restart" && req.method === "POST") {
        setTimeout(() => {
          restartServer(server, activePort);
        }, 300);
        return json({ ok: true, message: "Server restarting" });
      }

      // ------- skills & prompts catalog -------
      if (path === "/api/skills/catalog" && req.method === "GET") {
        const projectDir = url.searchParams.get("projectDir") || undefined;
        const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("force") === "1";
        const catalog = await getFullCatalog(projectDir, refresh);
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
          const raw = url.searchParams.get("raw");
          const contextParam = url.searchParams.get("context");
          if (raw === "1" || raw === "true") {
            return json(getMessages(id));
          }
          if (contextParam === "1" || contextParam === "true" || hasSessionContext(id)) {
            return json(getContextMessages(id));
          }
          return json(getMessages(id));
        }
        if (req.method === "DELETE") {
          if (projectBusy(s.project_dir)) return json({ error: "Stop active work before deleting this session" }, 409);
          deleteSession(id);
          sessions.delete(id);
          return json({ ok: true });
        }
        if (req.method === "PATCH") {
          const b = await body<{ title?: string; provider?: string; model?: string; projectDir?: string }>(req);
          if (b.projectDir && projectBusy(s.project_dir)) return json({ error: "Stop active work before changing projects" }, 409);
          updateSessionMeta(id, b);
          const ns = getSession(id)!;
          sessions.set(id, ns);
          return json(ns);
        }
        if (req.method === "POST" && path.endsWith("/generate-title")) {
          const msgs = getMessages(id);
          const firstUser = msgs.find((m) => m.data?.role === "user");
          const text = firstUser?.data?.parts?.find((p: any) => p.type === "text")?.text || s.title || "Сессия Klodex";
          const cfg = loadConfig();
          const defKey = parseModelKey(defaultModelKey()) ?? { provider: "opencode", model: "deepseek-v4.1-flash-free" };
          const chosenProv = s.provider || cfg.defaultProvider || defKey.provider;
          const chosenMod = s.model || cfg.defaultModel || defKey.model;
          const genTitle = await generateTitleWithModel(text, { provider: chosenProv, model: chosenMod }, s.project_dir);
          updateSessionMeta(id, { title: genTitle });
          const ns = getSession(id)!;
          sessions.set(id, ns);
          return json(ns);
        }
        if (req.method === "GET" && path.endsWith("/token-stats")) {
          return json(getSessionTokenStats(id));
        }
        if (req.method === "GET") return json(s);
      }

      // ------- token stats -------
      if (path === "/api/stats" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        const full = getFullTokenStats();
        if (sessionId) {
          const sessionStats = getSessionTokenStats(sessionId);
          return json({ ...full, session: sessionStats });
        }
        return json(full);
      }

      if (path === "/api/stats/reset" && req.method === "POST") {
        const b = (await body<{ sessionId?: string }>(req).catch(() => ({}))) as { sessionId?: string };
        clearTokenUsage(b?.sessionId ? { sessionId: b.sessionId } : undefined);
        return json({ ok: true });
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
        if (projectBusy(session.project_dir)) return json({ error: "Project is busy. Add the task to the queue." }, 409);
        if ((b.screenshots?.length ?? 0) > 4) return json({ error: "Maximum four screenshots" }, 400);
        return handleAgentStream(session, b.message, b.model, undefined, b.screenshots);
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

      if (path === "/api/chat/compact" && req.method === "POST") {
        const b = await body<{ sessionId: string }>(req);
        if (!b.sessionId) return json({ error: "sessionId is required" }, 400);
        const session = getSession(b.sessionId);
        if (!session) return json({ error: "Session not found" }, 404);
        if (projectBusy(session.project_dir)) return json({ error: "Wait for the active task before compacting" }, 409);
        const key = parseModelKey(`${session.provider}/${session.model}`) ?? parseModelKey(defaultModelKey())!;
        const res = await compactContext(b.sessionId, key.provider, key.model);
        const messages = getContextMessages(b.sessionId);
        return json({ ok: true, ...res, messages });
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
  };

  const handler = createHandler();

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      server = Bun.serve({
        port: activePort,
        idleTimeout: 255,
        fetch: handler,
      });
      break;
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" || String(err).includes("EADDRINUSE")) {
        console.warn(`  \x1b[33m[!] Порт ${activePort} занят другим процессом, переключаюсь на ${activePort + 1}…\x1b[0m`);
        activePort++;
      } else {
        throw err;
      }
    }
  }

  if (!server) {
    throw new Error(`Не удалось запустить сервер: порты ${preferredPort}–${activePort} заняты`);
  }

  return server;
}
