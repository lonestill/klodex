import type { UIMessage } from "ai";

export type ChatPart =
  | { type: "text"; text: string; id: string }
  | { type: "reasoning"; text: string; id: string }
  | {
      type: `tool-${string}`;
      toolCallId: string;
      state: "input-available" | "output-available" | "output-error";
      input: unknown;
      output?: unknown;
      errorText?: string;
    };

export interface LiveMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
  model?: string;
  pending?: boolean;
  statusText?: string;
  stage?: "connecting" | "waiting" | "retry" | "tool" | "thinking" | "streaming" | "compacting";
  retryDelayMs?: number;
  startedAt?: number;
  usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; durationMs?: number };
}

export interface SendPayload {
  sessionId: string | null;
  projectDir?: string;
  text: string;
  provider: string;
  model: string;
}

type ChatStoreCallbacks = {
  onSessionsChanged: () => void;
  onSessionCreated: (sessionId: string) => void;
};

/** Aggregates SSE events into a LiveMessage incrementally without re-render churn. */
export class ChatAggregator {
  parts: ChatPart[] = [];
  pendingTools = new Map<string, number>();
  cancelled = false;

  private findToolIndex(callId: string): number {
    return this.parts.findIndex(
      (p) => "toolCallId" in p && p.toolCallId === callId,
    );
  }

  startTool(callId: string, name: string, input: unknown): void {
    const idx = this.findToolIndex(callId);
    const part: ChatPart = {
      type: `tool-${name}`,
      toolCallId: callId,
      state: "input-available",
      input,
    } as ChatPart;
    if (idx >= 0) this.parts[idx] = part;
    else this.parts.push(part);
  }

  finishTool(callId: string, name: string, output: string, isError: boolean): void {
    const idx = this.findToolIndex(callId);
    if (idx < 0) {
      this.startTool(callId, name, {});
      return;
    }
    const part = this.parts[idx] as Extract<ChatPart, { type: `tool-${string}` }>;
    part.state = isError ? "output-error" : "output-available";
    if (isError) part.errorText = output;
    else part.output = output;
  }

  text(delta: string): void {
    const last = this.parts[this.parts.length - 1];
    if (last && last.type === "text") {
      last.text += delta;
    } else {
      this.parts.push({ type: "text", text: delta, id: crypto.randomUUID() });
    }
  }

  reason(delta: string): void {
    const last = this.parts[this.parts.length - 1];
    if (last && last.type === "reasoning") {
      last.text += delta;
    } else {
      this.parts.push({ type: "reasoning", text: delta, id: crypto.randomUUID() });
    }
  }

  abortPendingTools(reason?: string): void {
    const defaultReason =
      typeof localStorage !== "undefined" && localStorage.getItem("klodex_lang") === "ru"
        ? "Выполнение прервано пользователем (Stop)"
        : "Execution aborted by user (Stop)";
    const actualReason = reason || defaultReason;
    for (const p of this.parts) {
      if (typeof p.type === "string" && (p.type.startsWith("tool-") || "toolCallId" in p)) {
        const toolPart = p as any;
        if (toolPart.state === "input-available" || (toolPart.output === undefined && toolPart.errorText === undefined)) {
          toolPart.state = "output-error";
          toolPart.errorText = `[${actualReason}]`;
        }
      }
    }
  }
}
