import { tool, streamText, stepCountIs } from "ai";
import { z } from "zod";
import { buildModel, resilientContextStorage } from "./providers.ts";
import { buildTools, type ToolCtx } from "./tools.ts";
import { loadConfig } from "./config.ts";
import { saveSubagent } from "./store.ts";

export type SwarmRole = "explore" | "coder" | "tester" | "general";

export interface SwarmTaskDef {
  id: string;
  agent: SwarmRole;
  prompt: string;
  model?: string;
  label?: string;
}

export interface SwarmBlackboardNote {
  author: string;
  key: string;
  content: string;
  timestamp: number;
}

export interface SwarmMessage {
  from: string;
  to: string;
  message: string;
  timestamp: number;
}

export interface SwarmTaskResult {
  id: string;
  agent: SwarmRole;
  model: string;
  ok: boolean;
  report: string;
  steps: number;
  durationMs: number;
  notesPosted: number;
  messagesSent: number;
}

export interface SwarmExecutionResult {
  swarmId: string;
  title?: string;
  total: number;
  completed: number;
  failed: number;
  durationMs: number;
  blackboard: Record<string, SwarmBlackboardNote>;
  messages: SwarmMessage[];
  tasks: SwarmTaskResult[];
  markdownReport: string;
}

/** Shared message bus and blackboard for a swarm run. */
export class SwarmBus {
  private blackboard = new Map<string, SwarmBlackboardNote>();
  private messages: SwarmMessage[] = [];
  private inboxes = new Map<string, SwarmMessage[]>();

  constructor(
    public readonly swarmId: string,
    private tasks: SwarmTaskDef[],
    private onEvent?: (event: any) => void,
  ) {
    for (const t of tasks) {
      this.inboxes.set(t.id, []);
    }
  }

  postNote(author: string, key: string, content: string): void {
    const note: SwarmBlackboardNote = { author, key, content, timestamp: Date.now() };
    this.blackboard.set(key, note);
    this.onEvent?.({
      t: "swarm_note",
      swarmId: this.swarmId,
      author,
      key,
    });
  }

  getNotes(key?: string): Record<string, SwarmBlackboardNote> {
    if (key) {
      const note = this.blackboard.get(key);
      return note ? { [key]: note } : {};
    }
    return Object.fromEntries(this.blackboard);
  }

  sendMessage(from: string, to: string, message: string): void {
    const msg: SwarmMessage = { from, to, message, timestamp: Date.now() };
    this.messages.push(msg);
    if (to === "all") {
      for (const [id, list] of this.inboxes) {
        if (id !== from) list.push(msg);
      }
    } else {
      const box = this.inboxes.get(to);
      if (box) {
        box.push(msg);
      } else {
        this.inboxes.set(to, [msg]);
      }
    }
    this.onEvent?.({
      t: "swarm_msg",
      swarmId: this.swarmId,
      from,
      to,
    });
  }

  getInbox(agentId: string): SwarmMessage[] {
    const box = this.inboxes.get(agentId) ?? [];
    const unread = [...box];
    box.length = 0;
    return unread;
  }

  getAllMessages(): SwarmMessage[] {
    return [...this.messages];
  }

  getAllNotes(): Record<string, SwarmBlackboardNote> {
    return Object.fromEntries(this.blackboard);
  }

  getRoster(): Array<{ id: string; agent: SwarmRole; prompt: string }> {
    return this.tasks.map((t) => ({ id: t.id, agent: t.agent, prompt: t.prompt }));
  }
}

/** Build inter-agent communication tools connected to the shared swarm bus. */
function buildSwarmBusTools(bus: SwarmBus, agentId: string) {
  let notesPostedCount = 0;
  let messagesSentCount = 0;

  const share_note = tool({
    description:
      "Publish a note or artifact to the shared swarm blackboard. " +
      "All peer subagents can read this note. Use it to share discovered API specs, schemas, data structures, modified file paths, or findings.",
    inputSchema: z.object({
      key: z.string().describe("Short identifier or topic for this note, e.g. 'auth_api', 'db_schema', 'user_types'"),
      content: z.string().describe("The information, code snippets, or specification to share with other agents in the swarm"),
    }),
    execute: async ({ key, content }) => {
      bus.postNote(agentId, key, content);
      notesPostedCount++;
      return `Заметка "${key}" успешно опубликована на доске роя. Другие агенты увидят её.`;
    },
  });

  const read_notes = tool({
    description:
      "Read notes published to the shared swarm blackboard by other subagents. " +
      "Returns all notes, or a specific note if key is provided.",
    inputSchema: z.object({
      key: z.string().optional().describe("Optional note key to read. If omitted, returns all blackboard notes."),
    }),
    execute: async ({ key }) => {
      const notes = bus.getNotes(key);
      const entries = Object.entries(notes);
      if (entries.length === 0) {
        return key
          ? `Заметка с ключом "${key}" на доске не найдена.`
          : "Доска роя пока пуста (другие агенты ещё не опубликовали заметки).";
      }
      return entries
        .map(([k, note]) => `### [${k}] (автор: ${note.author})\n${note.content}`)
        .join("\n\n");
    },
  });

  const send_message = tool({
    description:
      "Send a direct message or query to another subagent in the swarm (or 'all' for broadcast). " +
      "Use this to ask a peer agent for clarification, request an interface spec, or notify them that a dependency is ready.",
    inputSchema: z.object({
      to: z.string().describe("Target subagent ID from the swarm roster (e.g. 'research_db', 'frontend_ui') or 'all'"),
      message: z.string().describe("The message or query to deliver to the peer agent"),
    }),
    execute: async ({ to, message }) => {
      bus.sendMessage(agentId, to, message);
      messagesSentCount++;
      return `Сообщение отправлено агенту "${to}".`;
    },
  });

  const check_inbox = tool({
    description: "Check your inbox for incoming messages sent by other subagents in this swarm.",
    inputSchema: z.object({}),
    execute: async () => {
      const msgs = bus.getInbox(agentId);
      if (msgs.length === 0) return "Входящих сообщений нет.";
      return msgs
        .map((m) => `От [${m.from}] (кому: ${m.to}): ${m.message}`)
        .join("\n\n");
    },
  });

  return {
    tools: { share_note, read_notes, send_message, check_inbox },
    getStats: () => ({ notesPostedCount, messagesSentCount }),
  };
}

function getSwarmSystemPrompt(args: {
  id: string;
  agent: SwarmRole;
  prompt: string;
  projectDir: string;
  sharedContext?: string;
  roster: Array<{ id: string; agent: SwarmRole; prompt: string }>;
}): string {
  const roleInstructions: Record<SwarmRole, string> = {
    explore:
      "ROLE: Fast read-only research agent. Thoroughly read files, grep code, inspect architecture. " +
      "Do NOT modify codebase files. Publish key findings and discovered schemas to the swarm blackboard via share_note.",
    coder:
      "ROLE: Full code implementation agent. Write, edit, create files, and run commands to implement your specific task. " +
      "Publish your API endpoints, exported functions, and changed file paths via share_note so peer agents can integrate seamlessly.",
    tester:
      "ROLE: Quality, verification & test agent. Run builds, linters, tests, and audit changes. " +
      "Inspect code produced by coders and report any defects, breakages, or test failures plainly.",
    general:
      "ROLE: Autonomous versatile agent. Complete the delegated subtask cleanly using all tools.",
  };

  const peerList = args.roster.length
    ? args.roster.map((r) => `- [${r.id}] (${r.agent}): ${r.prompt}`).join("\n")
    : "No other subagents in this run.";

  return `You are subagent "${args.id}" (${args.agent}) working inside a parallel Klodex swarm in ${args.projectDir}.

${roleInstructions[args.agent]}

# Swarm Context & Overarching Objective
${args.sharedContext?.trim() || "Complete the delegated tasks in parallel without interfering with peer agents."}

# Your Specific Assigned Task
${args.prompt}

# Peer Subagents in this Swarm
${peerList}

# Inter-Agent Collaboration & Coordination
You are working in parallel with peer agents. To coordinate:
1. 'share_note': Publish your findings, contracts, API signatures, types, or modified file paths to the shared blackboard.
2. 'read_notes': Read notes published by other agents. Always check notes if you depend on work from a peer!
3. 'send_message': Send direct questions, requests, or notifications to peer agents (e.g. asking for an export name).
4. 'check_inbox': Check if any peer agents sent you messages.

# Final Report
Your final text response is the only report the caller and orchestrator see. Be direct, concrete, state files modified/inspected, and summarize results.`;
}

/** Execute a batch of tasks concurrently with throttled concurrency limit. */
export async function executeSwarm(args: {
  projectDir: string;
  sessionId?: string;
  currentProvider: string;
  currentModel: string;
  title?: string;
  sharedContext?: string;
  tasks: SwarmTaskDef[];
  concurrency?: number;
  onEvent?: (event: any) => void;
}): Promise<SwarmExecutionResult> {
  const cfg = loadConfig();
  const swarmId = `swarm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const startTime = Date.now();
  const limit = Math.max(1, Math.min(args.concurrency ?? 4, 8));

  const bus = new SwarmBus(swarmId, args.tasks, args.onEvent);

  args.onEvent?.({
    t: "swarm_start",
    swarmId,
    total: args.tasks.length,
    tasks: args.tasks.map((t) => ({ id: t.id, agent: t.agent, model: t.model, prompt: t.prompt })),
  });

  // Resolve models for each task
  const resolvedTasks = args.tasks.map((task) => {
    let provider = args.currentProvider;
    let modelId = args.currentModel;
    if (task.model) {
      const idx = task.model.indexOf("/");
      if (idx > 0) {
        provider = task.model.slice(0, idx);
        modelId = task.model.slice(idx + 1);
      } else {
        modelId = task.model;
      }
    } else {
      const configured = (cfg.subagentModels as Record<string, string | undefined>)?.[task.agent];
      if (configured?.includes("/")) {
        provider = configured.slice(0, configured.indexOf("/"));
        modelId = configured.slice(configured.indexOf("/") + 1);
      }
    }
    return { ...task, provider, modelId, resolvedModel: `${provider}/${modelId}` };
  });

  // Worker pool for concurrent execution
  const results: SwarmTaskResult[] = new Array(resolvedTasks.length);
  let cursor = 0;

  const workerCount = Math.min(limit, resolvedTasks.length);
  const workers = Array.from({ length: workerCount }, async (_, workerIdx) => {
    // Stagger worker start to avoid thundering herd rate-limits on API
    if (workerIdx > 0) {
      await new Promise((r) => setTimeout(r, 200 * workerIdx));
    }
    while (true) {
      const index = cursor++;
      if (index >= resolvedTasks.length) return;
      const task = resolvedTasks[index]!;
      const taskStart = Date.now();

      args.onEvent?.({
        t: "swarm_update",
        swarmId,
        taskId: task.id,
        status: "running",
      });

      const { tools: busTools, getStats } = buildSwarmBusTools(bus, task.id);
      const toolCtx: ToolCtx = { projectDir: args.projectDir };
      const baseTools = buildTools(toolCtx, undefined);
      const subagentTools = { ...baseTools, ...busTools };

      await resilientContextStorage.run(
        {
          onStatus: (st) => {
            args.onEvent?.({
              t: "swarm_update",
              swarmId,
              taskId: task.id,
              status: st.stage === "retry" ? "ratelimit" : "running",
              action: st.message,
            });
          },
        },
        async () => {
          try {
            const m = await buildModel(task.provider, task.modelId);
            const systemPrompt = getSwarmSystemPrompt({
              id: task.id,
              agent: task.agent,
              prompt: task.prompt,
              projectDir: args.projectDir,
              sharedContext: args.sharedContext,
              roster: bus.getRoster().filter((r) => r.id !== task.id),
            });

            const res = streamText({
              model: m,
              instructions: systemPrompt,
              prompt: task.prompt,
              tools: subagentTools as any,
              stopWhen: stepCountIs(cfg.maxSubagentSteps || 32),
              maxRetries: 4,
            });

            let text = "";
            let reason = "";
            let currentAction = "Запуск агента…";

            for await (const part of res.fullStream as AsyncIterable<any>) {
              if (part.type === "text-delta") {
                const delta = part.text ?? part.textDelta ?? "";
                text += delta;
                if (text.length % 60 === 0) {
                  args.onEvent?.({
                    t: "swarm_update",
                    swarmId,
                    taskId: task.id,
                    status: "running",
                    action: currentAction,
                    preview: text.slice(-120),
                  });
                }
              } else if (part.type === "reasoning-delta") {
                const delta = part.text ?? part.textDelta ?? "";
                reason += delta;
                currentAction = "Думает…";
                if (reason.length % 60 === 0) {
                  args.onEvent?.({
                    t: "swarm_update",
                    swarmId,
                    taskId: task.id,
                    status: "running",
                    action: "Думает…",
                    preview: reason.slice(-120),
                  });
                }
              } else if (part.type === "tool-call") {
                const inp = part.input as any;
                const param = inp?.path || inp?.command || inp?.key || inp?.prompt || "";
                currentAction = `${part.toolName}${param ? ` (${String(param).slice(0, 30)})` : ""}`;
                args.onEvent?.({
                  t: "swarm_update",
                  swarmId,
                  taskId: task.id,
                  status: "running",
                  action: currentAction,
                  preview: `Вызов ${part.toolName}`,
                });
              } else if (part.type === "tool-result") {
                currentAction = `${part.toolName} ok`;
                args.onEvent?.({
                  t: "swarm_update",
                  swarmId,
                  taskId: task.id,
                  status: "running",
                  action: currentAction,
                  preview: String(part.output ?? part.result ?? "").slice(0, 80),
                });
              } else if (part.type === "error") {
                const errStr = part.error?.message ?? String(part.error);
                const isRateLimit = errStr.toLowerCase().includes("rate limit") || errStr.includes("429");
                args.onEvent?.({
                  t: "swarm_update",
                  swarmId,
                  taskId: task.id,
                  status: isRateLimit ? "ratelimit" : "error",
                  action: isRateLimit ? "⚠️ Лимит 429" : "Ошибка шага",
                  preview: errStr,
                });
                throw new Error(errStr);
              }
            }

            const finalText = (await res.text) || text;
            const finalSteps = (await res.steps) ?? [];
            const finalResponse = await res.response;
            const transcript = (finalResponse?.messages ?? []) as unknown as any[];

            if (args.sessionId) {
              try {
                saveSubagent({
                  sessionId: args.sessionId,
                  kind: `${task.agent}:${task.id}`,
                  prompt: task.prompt,
                  model: task.resolvedModel,
                  transcript,
                });
              } catch {}
            }
            const stats = getStats();
            const durationMs = Date.now() - taskStart;

            results[index] = {
              id: task.id,
              agent: task.agent,
              model: task.resolvedModel,
              ok: true,
              report: finalText || "(пустой отчёт)",
              steps: finalSteps.length || 1,
              durationMs,
              notesPosted: stats.notesPostedCount,
              messagesSent: stats.messagesSentCount,
            };

            args.onEvent?.({
              t: "swarm_update",
              swarmId,
              taskId: task.id,
              status: "done",
              action: `Готово (${(durationMs / 1000).toFixed(1)}с)`,
              preview: (finalText || "").slice(0, 150),
            });
          } catch (err: any) {
            const stats = getStats();
            const durationMs = Date.now() - taskStart;
            const rawMsg = err?.message ?? String(err);
            const isRateLimit = rawMsg.toLowerCase().includes("rate limit") || rawMsg.includes("429");
            const errorMsg = isRateLimit
              ? `RATE LIMIT (429): Превышен лимит запросов у провайдера для модели ${task.resolvedModel}.`
              : `ERROR: ${rawMsg}`;

            results[index] = {
              id: task.id,
              agent: task.agent,
              model: task.resolvedModel,
              ok: false,
              report: errorMsg,
              steps: 0,
              durationMs,
              notesPosted: stats.notesPostedCount,
              messagesSent: stats.messagesSentCount,
            };

            args.onEvent?.({
              t: "swarm_update",
              swarmId,
              taskId: task.id,
              status: isRateLimit ? "ratelimit" : "error",
              action: isRateLimit ? "⚠️ Лимит 429" : "Сбой выполнения",
              preview: errorMsg,
            });
          }
        },
      );
    }
  });

  await Promise.all(workers);

  const durationMs = Date.now() - startTime;
  const completed = results.filter((r) => r && r.ok).length;
  const failed = results.filter((r) => r && !r.ok).length;

  args.onEvent?.({
    t: "swarm_end",
    swarmId,
    ok: completed,
    failed,
  });

  const blackboard = bus.getAllNotes();
  const messages = bus.getAllMessages();

  const markdownReport = buildSwarmMarkdownReport({
    swarmId,
    title: args.title,
    total: results.length,
    completed,
    failed,
    durationMs,
    blackboard,
    messages,
    tasks: results,
  });

  return {
    swarmId,
    title: args.title,
    total: results.length,
    completed,
    failed,
    durationMs,
    blackboard,
    messages,
    tasks: results,
    markdownReport,
  };
}

function buildSwarmMarkdownReport(input: {
  swarmId: string;
  title?: string;
  total: number;
  completed: number;
  failed: number;
  durationMs: number;
  blackboard: Record<string, SwarmBlackboardNote>;
  messages: SwarmMessage[];
  tasks: SwarmTaskResult[];
}): string {
  const titleLine = input.title ? `# Swarm: ${input.title}\n` : `# Swarm Report (${input.swarmId})\n`;
  const summaryLine = `**Итог:** Завершено ${input.completed}/${input.total} агентов (${(input.durationMs / 1000).toFixed(1)}с). ` +
    `Опубликовано заметок: ${Object.keys(input.blackboard).length}, сообщений в чате роя: ${input.messages.length}.\n`;

  let notesSection = "";
  const noteEntries = Object.entries(input.blackboard);
  if (noteEntries.length > 0) {
    notesSection = "\n## Общая доска роя (Blackboard)\n" +
      noteEntries
        .map(([key, n]) => `### [${key}] (автор: \`${n.author}\`)\n${n.content}`)
        .join("\n\n");
  }

  let messagesSection = "";
  if (input.messages.length > 0) {
    messagesSection = "\n## Сообщения между агентами\n" +
      input.messages
        .map((m) => `- **[${m.from}] ➜ [${m.to}]:** ${m.message}`)
        .join("\n");
  }

  const reportsSection = "\n## Отчёты агентов\n" +
    input.tasks
      .map((t) => {
        const status = t.ok ? "✓ УСПЕШНО" : "✗ ОШИБКА";
        return `### [${t.id}] (${t.agent} · ${t.model} · ${status} · ${(t.durationMs / 1000).toFixed(1)}с · шагов: ${t.steps})\n${t.report}`;
      })
      .join("\n\n");

  return [titleLine, summaryLine, notesSection, messagesSection, reportsSection].filter(Boolean).join("\n");
}

/** Tool definition for the main orchestrator agent. */
export function buildSwarmTool(args: {
  projectDir: string;
  sessionId?: string;
  currentProvider: string;
  currentModel: string;
  onEvent?: (event: any) => void;
}) {
  return tool({
    description:
      "Launch a swarm of multiple specialized subagents working concurrently in parallel. " +
      "Subagents execute simultaneously and coordinate via a shared blackboard ('share_note', 'read_notes') and direct messaging ('send_message', 'check_inbox'). " +
      "Use this tool whenever you have 2 or more separable tasks (e.g. parallel research, implementing backend and frontend simultaneously, coding + writing tests, auditing multiple folders).",
    inputSchema: z.object({
      title: z.string().optional().describe("Short objective or title for this swarm run"),
      tasks: z
        .array(
          z.object({
            id: z.string().describe("Unique identifier for this subagent (e.g. 'research_db', 'backend_api', 'test_runner')"),
            agent: z.enum(["explore", "coder", "tester", "general"]).describe("Role of the subagent"),
            prompt: z.string().describe("Specific self-contained task instructions for this subagent"),
            model: z.string().optional().describe("Optional provider/model override (e.g. 'tooken/gpt-6.1-sol')"),
          }),
        )
        .min(1)
        .describe("List of subagents to run concurrently in this swarm"),
      sharedContext: z
        .string()
        .optional()
        .describe("High-level context, constraints, architecture, or goals relevant to all subagents in the swarm"),
    }),
    execute: async ({ title, tasks, sharedContext }) => {
      try {
        const result = await executeSwarm({
          projectDir: args.projectDir,
          sessionId: args.sessionId,
          currentProvider: args.currentProvider,
          currentModel: args.currentModel,
          title,
          sharedContext,
          tasks,
          onEvent: args.onEvent,
        });
        return result;
      } catch (err: any) {
        return { error: `Swarm execution failed: ${err?.message ?? String(err)}` };
      }
    },
  });
}
