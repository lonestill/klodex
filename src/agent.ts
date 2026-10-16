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
import { buildModel } from "./providers.ts";
import { buildTools, type ToolCtx } from "./tools.ts";
import { loadConfig } from "./config.ts";
import { saveSubagent } from "./store.ts";

const MAIN_SYSTEM = (ctx: ToolCtx) => `You are Klodex, an autonomous coding agent working in a web terminal for one operator.

# Environment
- Project directory (cwd): ${ctx.projectDir}
- Platform: ${process.platform}, shell: /bin/zsh
- Date: ${new Date().toISOString().slice(0, 10)}

# Method
- Understand the goal, then act. Plan internally; keep multi-step work moving step by step.
- Inspect before you change: read the relevant files before editing anything.
- Use tools for every real action. Never claim to have run anything you did not run.
- Batch independent read-only calls (read, glob, grep) in a single response to go faster.
- After code changes, run the relevant checks/tests via bash to verify, and fix what breaks.
- Prefer precise edits with the edit tool (exact strings); use write only for new files or full rewrites.
- Stay in scope: implement what was asked, keep the tree in a working state, avoid unrelated refactors.

# Report style
- Lead with the result. Then short mechanism/details. Match the operator's language and register.
- Reference concrete file paths and line numbers. No filler, no sign-offs, no unsolicited warnings.
- If a request is impossible or ambiguous in a way that changes the outcome, say so plainly and proceed on the most reasonable default noted briefly.`;

const EXPLORE_SYSTEM = `You are a fast read-only research subagent inside Klodex.
Find the answer to the given task by reading code with read/glob/grep (bash only for listing/read-only commands like ls, git log, find).
Do not modify anything. Report: direct answer first, then supporting file paths with line numbers, then a short summary of what you inspected.
Be thorough within a small budget; stop as soon as the answer is covered.`;

const GENERAL_SYSTEM = (ctx: ToolCtx) => `You are a focused implementation subagent inside Klodex, working in ${ctx.projectDir}.
Complete the delegated task using all tools (read, write, edit, glob, grep, bash). Inspect context first, implement cleanly in the codebase's existing style, verify with the appropriate commands.
Do not refactor beyond the task. Your final message is the only report the caller sees: state what was done (files changed, checks run and their results) concisely but completely.`;

export type AgentEvent =
  | { t: "start" }
  | { t: "text"; d: string }
  | { t: "reason"; d: string }
  | { t: "tool"; callId: string; name: string; input: unknown }
  | { t: "toolres"; callId: string; name: string; output: string; isError: boolean }
  | { t: "finish"; detail: { finishReason: string; steps: number; tokens: number } }
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
  const tools = buildTools(
    toolCtx,
    opts.excludeSubagent
      ? (undefined as any)
      : (opts.subagentTool ??
          buildSubagentTool({
            projectDir: ctx.projectDir,
            sessionId: ctx.sessionId,
            currentProvider: ctx.provider,
            currentModel: ctx.model,
          })),
  );
  if (opts.excludeSubagent) delete (tools as any).subagent;

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
  });

  for await (const part of result.fullStream as AsyncIterable<any>) {
    switch (part.type) {
      case "start-step":
        steps++;
        break;
      case "text-delta":
        builder.partText(part.id, part.text);
        opts.onEvent({ t: "text", d: part.text });
        break;
      case "reasoning-delta":
        builder.partReason(part.id, part.text);
        opts.onEvent({ t: "reason", d: part.text });
        break;
      case "tool-call":
        builder.partTool(part.toolCallId, part.toolName, part.input);
        opts.onEvent({ t: "tool", callId: part.toolCallId, name: part.toolName, input: part.input });
        break;
      case "tool-result":
        builder.finishTool(part.toolCallId, part.toolName, part.output ?? part.result ?? "", false);
        opts.onEvent({
          t: "toolres",
          callId: part.toolCallId,
          name: part.toolName,
          output: stringifyOutput(part.output ?? part.result),
          isError: false,
        });
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
        break;
      case "finish":
        finishReason = part.finishReason;
        tokens = Number(part.totalUsage?.totalTokens ?? 0);
        break;
      case "error":
        throw part.error ?? new Error("stream error");
    }
  }

  return { message: builder.done(), finishReason, steps, tokens };
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
      agent: z.enum(["explore", "general"]).describe("Kind of subagent"),
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
          const configured = loadConfig().subagentModels?.[agent];
          if (configured?.includes("/")) {
            provider = configured.slice(0, configured.indexOf("/"));
            modelId = configured.slice(configured.indexOf("/") + 1);
          }
        }
        const m = await buildModel(provider, modelId);
        const toolCtx: ToolCtx = { projectDir: args.projectDir };
        const res = await generateText({
          model: m,
          instructions: agent === "explore" ? EXPLORE_SYSTEM : GENERAL_SYSTEM(toolCtx),
          prompt,
          tools: buildTools(toolCtx, undefined as any),
          stopWhen: stepCountIs(cfg.maxSubagentSteps),
          maxRetries: 2,
        });
        const transcript = (res.response?.messages ?? []) as unknown as any[];
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
        return `${agent === "explore" ? "Explore" : "General"} agent report (model ${provider}/${modelId}, ${
          res.steps?.length ?? 1
        } step(s)):\n\n${res.text}`;
      } catch (e: any) {
        return `ERROR: subagent '${agent}' failed: ${e?.message ?? String(e)}`;
      }
    },
  });
}

export { MAIN_SYSTEM, EXPLORE_SYSTEM, GENERAL_SYSTEM, UIMessageBuilder };
