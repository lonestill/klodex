import {
  generateText,
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { buildModel, resilientContextStorage } from "./providers.ts";
import { buildTools, type ToolCtx } from "./tools.ts";
import { loadConfig } from "./config.ts";
import { saveSubagent } from "./store.ts";
import { buildSwarmTool } from "./swarm.ts";

const defaultShell = () => (process.platform === "win32" ? "PowerShell" : (process.env.SHELL?.trim() || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash")));

const MAIN_SYSTEM = (ctx: ToolCtx) => `You are Klodex, an autonomous coding agent working in a web terminal for one operator.

# Environment
- Project directory (cwd): ${ctx.projectDir}
- Platform: ${process.platform}, shell: ${defaultShell()}
- Date: ${new Date().toISOString().slice(0, 10)}

# Method
- Understand the goal, then act. Plan internally; keep multi-step work moving step by step.
- Inspect before you change: read the relevant files before editing anything.
- Use tools for every real action. Never claim to have run anything you did not run.
- Batch independent read-only calls (read, glob, grep) in a single response to go faster.
- After code changes, run the relevant checks/tests via bash to verify, and fix what breaks.
- Prefer precise edits with the edit tool (exact strings); use write only for new files or full rewrites.
- Stay in scope: implement what was asked, keep the tree in a working state, avoid unrelated refactors.

# Multi-Agent Swarms & Subagents
When a task has multiple independent parts or when He asks for parallel agents/swarm:
- Use the 'swarm' tool to launch a swarm of parallel subagents.
- Break the objective into distinct, self-contained tasks with unique IDs (e.g. 'research_db', 'backend_api', 'frontend_ui', 'tests').
- Available roles:
  * 'explore': fast read-only research, grepping, reading code.
  * 'coder': full implementation (writing code, editing files, running builds).
  * 'tester': quality assurance, writing tests, running tests, auditing changes.
  * 'general': autonomous general-purpose execution.
- Subagents execute concurrently in parallel and coordinate via a shared blackboard ('share_note', 'read_notes') and direct messaging ('send_message', 'check_inbox').
- For a single small one-off delegation, use 'subagent'.

# Report style
- Lead with the result. Then short mechanism/details. Match the operator's language and register.
- Reference concrete file paths and line numbers. No filler, no sign-offs, no unsolicited warnings.
- If a request is impossible or ambiguous in a way that changes the outcome, say so plainly and proceed on the most reasonable default noted briefly.`;

const EXPLORE_SYSTEM = `You are a fast read-only research subagent inside Klodex.
Find the answer to the given task by reading code with read/glob/grep (bash only for listing/read-only commands like ls, git log, find).
Do not modify anything. Report: direct answer first, then supporting file paths with line numbers, then a short summary of what you inspected.
Be thorough within a small budget; stop as soon as the answer is covered.`;

const CODER_SYSTEM = (ctx: ToolCtx) => `You are a focused code implementation subagent inside Klodex, working in ${ctx.projectDir}.
Complete the delegated task using all tools (read, write, edit, glob, grep, bash). Inspect context first, implement cleanly in the codebase's existing style, verify with the appropriate commands.
Publish API contracts, exported functions, and changed file paths via share_note so peer agents can integrate seamlessly.
Do not refactor beyond the task. State what was done concisely and completely in your final report.`;

const TESTER_SYSTEM = (ctx: ToolCtx) => `You are a quality assurance and test verification subagent inside Klodex, working in ${ctx.projectDir}.
Inspect code changes, run existing test suites, write missing tests if needed, run linters and compilers via bash.
Report any breakages, test failures, or bugs with concrete file paths and reproduction steps.`;

const GENERAL_SYSTEM = (ctx: ToolCtx) => `You are a focused implementation subagent inside Klodex, working in ${ctx.projectDir}.
Complete the delegated task using all tools (read, write, edit, glob, grep, bash). Inspect context first, implement cleanly in the codebase's existing style, verify with the appropriate commands.
Do not refactor beyond the task. Your final message is the only report the caller sees: state what was done (files changed, checks run and their results) concisely but completely.`;

export type AgentEvent =
  | { t: "start"; provider?: string; model?: string }
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
  | { t: "error"; message: string };

/** Accumulates a v5-style UIMessage from stream parts so it can be persisted and re-sent. */
class UIMessageBuilder {
  id: string;
  role = "assistant" as const;
  parts: any[] = [];
  private textParts = new Map<string, any>();
  private reasonParts = new Map<string, any>();
  private toolParts = new Map<string, any>();

  constructor(id = crypto.randomUUID()) {
    this.id = id;
  }

  partText(id: string, delta: string) {
    let p = this.textParts.get(id);
    if (!p) {
      p = { type: "text", text: "" };
      this.textParts.set(id, p);
      this.parts.push(p);
    }
    p.text += delta;
  }

  partReason(id: string, delta: string) {
    let p = this.reasonParts.get(id);
    if (!p) {
      p = { type: "reasoning", text: "" };
      this.reasonParts.set(id, p);
      this.parts.push(p);
    }
    p.text += delta;
  }

  partTool(callId: string, name: string, input: unknown) {
    const p = { type: `tool-${name}`, toolCallId: callId, state: "input-available", input };
    this.toolParts.set(callId, p);
    this.parts.push(p);
    return p;
  }

  finishTool(callId: string, name: string, output: unknown, isError: boolean) {
    let p = this.toolParts.get(callId);
    if (!p) {
      p = { type: `tool-${name}`, toolCallId: callId, state: "input-available", input: {} };
      this.toolParts.set(callId, p);
      this.parts.push(p);
    }
    p.state = isError ? "output-error" : "output-available";
    if (isError) (p as any).errorText = String(output);
    else (p as any).output = output;
  }

  done(): UIMessage {
    return { id: this.id, role: this.role, parts: this.parts } as UIMessage;
  }
}

export type RunContext = {
  projectDir: string;
  provider: string;
  model: string;
  history: UIMessage[];
  sessionId?: string;
  instructionsExtra?: string;
};

export type AgentRunResult = {
  message: UIMessage;
  finishReason: string;
  steps: number;
  tokens: number;
};

export async function runAgent(
  ctx: RunContext,
  opts: { onEvent: (e: AgentEvent) => void; abort?: AbortSignal; subagentTool?: any; excludeSubagent?: boolean },
): Promise<AgentRunResult> {
  const cfg = loadConfig();
  const model = await buildModel(ctx.provider, ctx.model);
  const toolCtx: ToolCtx = { projectDir: ctx.projectDir };
  const subagent = opts.excludeSubagent
    ? undefined
    : (opts.subagentTool ??
        buildSubagentTool({
          projectDir: ctx.projectDir,
          sessionId: ctx.sessionId,
          currentProvider: ctx.provider,
          currentModel: ctx.model,
        }));

  const swarm = opts.excludeSubagent
    ? undefined
    : buildSwarmTool({
        projectDir: ctx.projectDir,
        sessionId: ctx.sessionId,
        currentProvider: ctx.provider,
        currentModel: ctx.model,
        onEvent: opts.onEvent,
      });

  const tools = buildTools(
    toolCtx,
    opts.excludeSubagent
      ? {}
      : {
          ...(subagent ? { subagent } : {}),
          ...(swarm ? { swarm } : {}),
        },
  );
  if (opts.excludeSubagent) {
    delete (tools as any).subagent;
    delete (tools as any).swarm;
  }

  const modelMessages = await convertToModelMessages(ctx.history);
  console.log("[agent] history:", ctx.history.length, "modelMessages:", modelMessages.length, "provider:", ctx.provider, "model:", ctx.model);
  const builder = new UIMessageBuilder();
  let steps = 0;
  let tokens = 0;
  let finishReason = "unknown";

  const userInstructions = cfg.systemPrompt?.trim()
    ? `\n\n# User Instructions & Preferences\n${cfg.systemPrompt.trim()}`
    : "";

  const result = streamText({
    model,
    instructions: (ctx.instructionsExtra ?? "") + "\n\n" + MAIN_SYSTEM(toolCtx) + userInstructions,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(cfg.maxSteps),
    abortSignal: opts.abort,
    maxRetries: 4,
  });

  return resilientContextStorage.run(
    {
      onStatus: (st) => {
        opts.onEvent({
          t: "status",
          message: st.message,
          stage: st.stage,
          attempt: st.attempt,
          delayMs: st.delayMs,
        });
      },
    },
    async () => {
      const startTime = Date.now();
      let firstTokenReceived = false;

      opts.onEvent({
        t: "status",
        message: `Подключение к API ${ctx.provider}/${ctx.model}…`,
        stage: "connecting",
        elapsedMs: 0,
      });

      const heartbeatTimer = setInterval(() => {
        if (opts.abort?.aborted) return;
        const elapsed = Date.now() - startTime;
        if (!firstTokenReceived && elapsed >= 3000) {
          const elapsedSec = Math.floor(elapsed / 1000);
          opts.onEvent({
            t: "status",
            message: `Ожидание ответа модели (${elapsedSec}с)…`,
            stage: "waiting",
            elapsedMs: elapsed,
          });
        }
      }, 2000);

      try {
        for await (const part of result.fullStream as AsyncIterable<any>) {
          switch (part.type) {
            case "start-step":
              steps++;
              break;
            case "text-delta":
              firstTokenReceived = true;
              builder.partText(part.id, part.text);
              opts.onEvent({ t: "text", d: part.text });
              opts.onEvent({ t: "status", message: "Печатает ответ…", stage: "streaming" });
              break;
            case "reasoning-delta":
              firstTokenReceived = true;
              builder.partReason(part.id, part.text);
              opts.onEvent({ t: "reason", d: part.text });
              opts.onEvent({ t: "status", message: "Модель рассуждает…", stage: "thinking" });
              break;
            case "tool-call": {
              firstTokenReceived = true;
              builder.partTool(part.toolCallId, part.toolName, part.input);
              opts.onEvent({ t: "tool", callId: part.toolCallId, name: part.toolName, input: part.input });
              const argSnippet = (part.input as any)?.command || (part.input as any)?.filePath || (part.input as any)?.pattern || "";
              const snippetStr = argSnippet ? ` (${String(argSnippet).slice(0, 30)})` : "";
              opts.onEvent({ t: "status", message: `Выполняется ${part.toolName}${snippetStr}…`, stage: "tool" });
              break;
            }
            case "tool-result":
              builder.finishTool(part.toolCallId, part.toolName, part.output ?? part.result ?? "", false);
              opts.onEvent({
                t: "toolres",
                callId: part.toolCallId,
                name: part.toolName,
                output: stringifyOutput(part.output ?? part.result),
                isError: false,
              });
              opts.onEvent({ t: "status", message: `Инструмент ${part.toolName} выполнен. Формирую ответ…`, stage: "waiting" });
              break;
            case "tool-error":
              builder.finishTool(part.toolCallId, part.toolName ?? "tool", part.error ?? "unknown error", true);
              opts.onEvent({
                t: "toolres",
                callId: part.toolCallId,
                name: part.toolName ?? "tool",
                output: String(part.error),
                isError: true,
              });
              opts.onEvent({ t: "status", message: `Ошибка инструмента ${part.toolName}. Корректирую план…`, stage: "waiting" });
              break;
            case "finish":
              finishReason = part.finishReason;
              tokens = Number(part.totalUsage?.totalTokens ?? 0);
              break;
            case "error":
              throw part.error ?? new Error("stream error");
          }
        }
      } catch (e: any) {
        const isAbort =
          opts.abort?.aborted ||
          e?.name === "AbortError" ||
          String(e?.message || e).toLowerCase().includes("abort");
        if (isAbort) {
          finishReason = "abort";
          return { message: builder.done(), finishReason, steps, tokens };
        }
        const msg = String(e?.message || e);
        const isRateLimit = msg.toLowerCase().includes("rate limit") || msg.includes("429");
        if (isRateLimit) {
          const notice = `\n\n> ⚠️ **Лимит запросов у провайдера (Rate limit / 429)**. Провайдер временно ограничил частоту вызовов. Подожди 10-20 секунд или переключи модель в шапке.`;
          builder.partText(crypto.randomUUID(), notice);
          opts.onEvent({ t: "text", d: notice });
          finishReason = "rate_limit";
          return { message: builder.done(), finishReason, steps, tokens };
        }
        throw e;
      } finally {
        clearInterval(heartbeatTimer);
      }

      return { message: builder.done(), finishReason, steps, tokens };
    },
  );
}

function stringifyOutput(o: unknown): string {
  if (typeof o === "string") return o;
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

export function buildSubagentTool(args: {
  projectDir: string;
  sessionId?: string;
  currentProvider: string;
  currentModel: string;
}) {
  const cfg = loadConfig();
  return tool({
    description:
      "Spawn a subagent that runs its own multi-step tool loop and returns its final report. " +
      "'explore' is a fast read-only researcher (find/inspect code, gather context); " +
      "'general' is a full implementation agent for self-contained subtasks (build one thing, verify, report). " +
      "Launch independent subagents in the same response when you can; their prompts must be self-contained. " +
      "Use instead of doing the work yourself when the research or the subtask is clearly separable.",
    inputSchema: z.object({
      agent: z.enum(["explore", "coder", "tester", "general"]).describe("Kind of subagent ('explore' for research, 'coder' for code implementation, 'tester' for testing/verification, 'general' for multi-purpose)"),
      prompt: z
        .string()
        .min(1)
        .describe("Precise self-contained task description with all needed context"),
      model: z
        .string()
        .optional()
        .describe("Optional provider/model override (e.g. 'tooken/gpt-6.1-sol'); defaults are configured per kind"),
    }),
    execute: async ({ agent, prompt, model }) => {
      try {
        let provider = args.currentProvider;
        let modelId = args.currentModel;
        if (model) {
          const idx = model.indexOf("/");
          if (idx > 0) {
            provider = model.slice(0, idx);
            modelId = model.slice(idx + 1);
          } else {
            modelId = model;
          }
        } else {
          const configured = (loadConfig().subagentModels as Record<string, string | undefined>)?.[agent];
          if (configured?.includes("/")) {
            provider = configured.slice(0, configured.indexOf("/"));
            modelId = configured.slice(configured.indexOf("/") + 1);
          }
        }
        const m = await buildModel(provider, modelId);
        const toolCtx: ToolCtx = { projectDir: args.projectDir };

        let instructions = GENERAL_SYSTEM(toolCtx);
        if (agent === "explore") instructions = EXPLORE_SYSTEM;
        else if (agent === "coder") instructions = CODER_SYSTEM(toolCtx);
        else if (agent === "tester") instructions = TESTER_SYSTEM(toolCtx);

        const res = streamText({
          model: m,
          instructions,
          prompt,
          tools: buildTools(toolCtx, undefined as any),
          stopWhen: stepCountIs(cfg.maxSubagentSteps),
          maxRetries: 4,
        });

        let text = "";
        for await (const part of res.fullStream as AsyncIterable<any>) {
          if (part.type === "text-delta") text += part.text ?? part.textDelta ?? "";
          else if (part.type === "error") throw new Error(part.error?.message ?? String(part.error));
        }

        const finalText = (await res.text) || text;
        const finalSteps = (await res.steps) ?? [];
        const finalResponse = await res.response;
        const transcript = (finalResponse?.messages ?? []) as unknown as any[];

        if (args.sessionId) {
          try {
            saveSubagent({
              sessionId: args.sessionId,
              kind: agent,
              prompt,
              model: `${provider}/${modelId}`,
              transcript,
            });
          } catch {}
        }
        const titleName = agent.slice(0, 1).toUpperCase() + agent.slice(1);
        return `${titleName} agent report (model ${provider}/${modelId}, ${
          finalSteps.length || 1
        } step(s)):\n\n${finalText}`;
      } catch (e: any) {
        return `ERROR: subagent '${agent}' failed: ${e?.message ?? String(e)}`;
      }
    },
  });
}

export { MAIN_SYSTEM, EXPLORE_SYSTEM, CODER_SYSTEM, TESTER_SYSTEM, GENERAL_SYSTEM, UIMessageBuilder };
