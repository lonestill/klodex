import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyIcon,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  Plus,
  Settings2,
  FolderCode,
  Activity,
  Cpu,
  AlertTriangle,
  Brain,
  Clock,
  Sparkles,
  Check,
  Wrench,
  Copy,
  Download,
  HelpCircle,
  Terminal,
  Boxes,
  Pencil,
  X,
} from "lucide-react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { AgentActionGroup, type ToolPart } from "@/components/klodex/agent-tools";
import { Streamdown } from "streamdown";

import {
  api,
  chatStream,
  chatStreamReconnect,
  modelKey,
  type AgentEvent,
  type KlodexProvider,
  type ProviderSort,
  type SessionRow,
  type SlashCommand,
} from "@/lib/api";
import { ChatAggregator, type LiveMessage, type ChatPart } from "@/lib/chat-aggregator";
import { ChatEmptyState } from "@/components/klodex/chat-empty-state";
import { AgentMonitorPanel, type SwarmTelemetry } from "@/components/klodex/agent-monitor-panel";

interface Props {
  catalog: KlodexProvider[];
  onCatalogRefresh: () => Promise<void>;
  sessions: SessionRow[];
  reloadSessions: () => Promise<void>;
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  onCurrentSessionChange?: (id: string | null) => void;
  providerSort: ProviderSort;
}

type RenderItem =
  | { kind: "reasoning"; part: { id?: string; text: string }; index: number }
  | { kind: "text"; part: { id?: string; text: string }; isLast: boolean; index: number }
  | { kind: "tools"; parts: ToolPart[]; startIndex: number };

function groupParts(parts: ChatPart[]): RenderItem[] {
  const items: RenderItem[] = [];
  let currentTools: ToolPart[] = [];
  let toolStartIndex = 0;

  const flushTools = () => {
    if (currentTools.length > 0) {
      items.push({ kind: "tools", parts: currentTools, startIndex: toolStartIndex });
      currentTools = [];
    }
  };

  parts.forEach((part, i) => {
    if (part.type === "reasoning") {
      flushTools();
      items.push({ kind: "reasoning", part, index: i });
    } else if (part.type === "text") {
      flushTools();
      const isLast = i === parts.length - 1 || parts.slice(i + 1).every((p) => p.type !== "text");
      items.push({ kind: "text", part, isLast, index: i });
    } else if (typeof part.type === "string" && (part.type.startsWith("tool-") || "toolCallId" in part)) {
      if (currentTools.length === 0) {
        toolStartIndex = i;
      }
      currentTools.push(part as unknown as ToolPart);
    } else {
      flushTools();
      items.push({ kind: "text", part: part as any, isLast: i === parts.length - 1, index: i });
    }
  });

  flushTools();
  return items;
}

/* ---------- live status badge ---------- */

function LiveStatusBadge({ msg }: { msg: LiveMessage }) {
  const [elapsed, setElapsed] = useState(() => (msg.startedAt ? Date.now() - msg.startedAt : 0));

  useEffect(() => {
    if (!msg.pending) return;
    const interval = setInterval(() => {
      if (msg.startedAt) {
        setElapsed(Date.now() - msg.startedAt);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [msg.pending, msg.startedAt]);

  const elapsedSec = Math.floor(elapsed / 1000);
  const isRetry = msg.stage === "retry";
  const isThinking = msg.stage === "thinking";
  const isTool = msg.stage === "tool";

  return (
    <div className="space-y-1.5 pt-0.5">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium w-fit transition-colors",
          isRetry
            ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
            : "border-primary/20 bg-primary/5 text-primary",
        )}
      >
        {isRetry ? (
          <AlertTriangle className="size-3.5 text-amber-500 animate-bounce shrink-0" />
        ) : isThinking ? (
          <Brain className="size-3.5 text-purple-400 animate-pulse shrink-0" />
        ) : isTool ? (
          <Wrench className="size-3.5 text-primary animate-spin shrink-0" />
        ) : (
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
        )}
        <span className="font-mono text-[11px]">
          {msg.statusText || (isThinking ? "Модель рассуждает…" : "Думаю…")}
        </span>
        {elapsedSec > 0 && (
          <span className="text-[10px] opacity-75 font-mono">({elapsedSec}с)</span>
        )}
      </div>

      {msg.pending && !msg.parts.length && (isRetry ? elapsedSec >= 8 : elapsedSec >= 25) && (
        <div className="text-[11px] text-muted-foreground/85 bg-muted/30 border border-border/40 rounded-md p-2.5 max-w-md leading-relaxed animate-in fade-in duration-300 space-y-1">
          <p className="font-medium text-foreground/90 flex items-center gap-1.5">
            <Clock className="size-3 text-muted-foreground" />
            <span>Почему агент долго отвечает?</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isRetry
              ? "У провайдера сработал лимит запросов (Rate limit / 429). Klodex автоматически повторяет запрос с бэкоффом."
              : "Модель выполняет глубокие рассуждения (thinking) или сервер генерирует первый токен. Если ответ завис, нажми «Стоп» внизу и выбери другую модель."}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- assistant message ---------- */

function AssistantMessage({ msg, defaultOpenReasoning = false }: { msg: LiveMessage; defaultOpenReasoning?: boolean }) {
  const items = useMemo(() => groupParts(msg.parts), [msg.parts]);

  return (
    <Message className="grow-0">
      <MessageContent className="gap-2.5">
        {items.map((item) => {
          if (item.kind === "reasoning") {
            return (
              <Reasoning
                key={item.part.id ?? item.index}
                isStreaming={item.index === msg.parts.length - 1 && msg.pending}
                defaultOpen={defaultOpenReasoning}
              >
                <ReasoningTrigger />
                <ReasoningContent>{item.part.text}</ReasoningContent>
              </Reasoning>
            );
          }
          if (item.kind === "text") {
            return (
              <div
                key={item.part.id ?? item.index}
                className={cn(
                  "min-w-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 leading-relaxed text-sm",
                  item.isLast && msg.pending && "after:content-['▍'] after:text-primary after:animate-pulse",
                )}
              >
                <Streamdown>{item.part.text}</Streamdown>
              </div>
            );
          }
          if (item.kind === "tools") {
            return (
              <AgentActionGroup
                key={`tools-${item.startIndex}-${item.parts[0]?.toolCallId ?? item.startIndex}`}
                tools={item.parts}
              />
            );
          }
          return null;
        })}

        {msg.pending && (!msg.parts.length || msg.stage === "retry") && (
          <LiveStatusBadge msg={msg} />
        )}

        <MessageFooter className="text-muted-foreground text-[11px] pt-1">
          {msg.model}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

/* ---------- slash command icon helper ---------- */

function getSlashCommandIcon(cmd: SlashCommand) {
  const id = (cmd.name || cmd.id || "").toLowerCase();
  const slash = (cmd.slash || "").toLowerCase();
  if (cmd.isStock) {
    if (id.includes("очистить") || slash === "/clear") {
      return <Trash2 className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("новая") || slash === "/new") {
      return <Plus className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("папку") || slash === "/project" || slash === "/folder") {
      return <FolderCode className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("остановить") || slash === "/stop") {
      return <Square className="size-3.5 text-destructive shrink-0" />;
    }
    if (id.includes("монитор") || slash === "/monitor") {
      return <Activity className="size-3.5 text-violet-400 shrink-0" />;
    }
    if (id.includes("скопировать") || slash === "/copy") {
      return <Copy className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("экспорт") || slash === "/export") {
      return <Download className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("настройки") || slash === "/settings") {
      return <Settings2 className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("каталог") || id.includes("расширений") || slash === "/skills" || slash === "/catalog") {
      return <Boxes className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("справка") || slash === "/help") {
      return <HelpCircle className="size-3.5 text-muted-foreground shrink-0" />;
    }
    return <Terminal className="size-3.5 text-muted-foreground shrink-0" />;
  }
  if (cmd.type === "composite") {
    return <Sparkles className="size-3.5 text-purple-400 shrink-0" />;
  }
  return <Terminal className="size-3.5 text-primary shrink-0" />;
}

/* ---------- chat screen ---------- */

export function KlodexChat({
  catalog,
  onCatalogRefresh,
  sessions: _sessions,
  reloadSessions,
  selected,
  onSelectedChange,
  onCurrentSessionChange,
  providerSort: _providerSort,
}: Props) {
  const [currentSession, setCurrentSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [live, setLive] = useState<LiveMessage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyDialog, setKeyDialog] = useState<string | null>(null);
  const [keyInputVal, setKeyInputVal] = useState("");
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [swarmTelemetry, setSwarmTelemetry] = useState<SwarmTelemetry | null>(null);
  const [currentAgentAction, setCurrentAgentAction] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [reasoningDefaultOpen, setReasoningDefaultOpen] = useState(() => {
    return localStorage.getItem("klodex_reasoning_default_open") === "true";
  });
  const [onlyFree, setOnlyFree] = useState<boolean>(() => {
    return localStorage.getItem("klodex_only_free") === "true";
  });
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashListRef = useRef<HTMLDivElement>(null);

  const getPromptHistory = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem("klodex_prompt_history") || "[]");
    } catch {
      return [];
    }
  }, []);

  const savePromptHistory = useCallback((prompt: string) => {
    try {
      const list = getPromptHistory().filter((p) => p !== prompt);
      list.unshift(prompt);
      localStorage.setItem("klodex_prompt_history", JSON.stringify(list.slice(0, 50)));
    } catch {}
  }, [getPromptHistory]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    const handleSetInputText = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text === "string" && textareaRef.current) {
        textareaRef.current.value = text;
        textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
        textareaRef.current.focus();
      }
    };
    window.addEventListener("klodex:setInputText", handleSetInputText);
    return () => window.removeEventListener("klodex:setInputText", handleSetInputText);
  }, []);

  const abort = useCallback(async () => {
    abortRef.current?.abort();
    if (currentSession) void api.stop(currentSession.id).catch(() => {});
  }, [currentSession]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && streaming) {
        e.preventDefault();
        void abort();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [streaming, abort]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setReasoningDefaultOpen(detail);
    };
    const freeHandler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setOnlyFree(detail);
    };
    window.addEventListener("klodex:reasoningDefaultChanged", handler);
    window.addEventListener("klodex:onlyFreeChanged", freeHandler);
    return () => {
      window.removeEventListener("klodex:reasoningDefaultChanged", handler);
      window.removeEventListener("klodex:onlyFreeChanged", freeHandler);
    };
  }, []);

  const provider = useMemo(
    () => catalog.find((p) => p.id === selected?.provider) ?? null,
    [catalog, selected],
  );

  const handleToggleOnlyFree = useCallback(
    (next: boolean) => {
      setOnlyFree(next);
      localStorage.setItem("klodex_only_free", String(next));
      window.dispatchEvent(new CustomEvent("klodex:onlyFreeChanged", { detail: next }));
    },
    [],
  );

  const isModelDeprecated = useMemo(
    () => Boolean(provider?.models.find((m) => m.id === selected?.model)?.deprecated),
    [provider, selected],
  );

  // Session title inline editing and micro-model generation
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleVal, setEditingTitleVal] = useState("");
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const startEditTitle = useCallback(() => {
    if (!currentSession) return;
    setEditingTitleVal(currentSession.title ?? "");
    setIsEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 25);
  }, [currentSession]);

  const saveEditedTitle = useCallback(async () => {
    if (!currentSession) return;
    const trimmed = editingTitleVal.trim();
    setIsEditingTitle(false);
    if (!trimmed || trimmed === currentSession.title) return;
    try {
      const updated = await api.updateSession(currentSession.id, { title: trimmed });
      setCurrentSession((prev) => (prev ? { ...prev, title: updated.title } : prev));
      window.dispatchEvent(
        new CustomEvent("klodex:sessionTitleUpdated", {
          detail: { id: currentSession.id, title: updated.title },
        }),
      );
      void reloadSessions();
    } catch (e: any) {
      console.error("Failed to rename session:", e);
    }
  }, [currentSession, editingTitleVal, reloadSessions]);

  const handleGenerateTitle = useCallback(async () => {
    if (!currentSession || isGeneratingTitle) return;
    setIsGeneratingTitle(true);
    try {
      const updated = await api.generateSessionTitle(currentSession.id);
      if (updated?.title) {
        setCurrentSession((prev) => (prev ? { ...prev, title: updated.title } : prev));
        window.dispatchEvent(
          new CustomEvent("klodex:sessionTitleUpdated", {
            detail: { id: currentSession.id, title: updated.title },
          }),
        );
        void reloadSessions();
      }
    } catch (e: any) {
      console.error("Failed to generate title:", e);
    } finally {
      setIsGeneratingTitle(false);
    }
  }, [currentSession, isGeneratingTitle, reloadSessions]);

  useEffect(() => {
    const handleTitleUpdated = (e: any) => {
      const { id, title } = e.detail || {};
      if (currentSession && currentSession.id === id) {
        setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
      }
    };
    window.addEventListener("klodex:sessionTitleUpdated", handleTitleUpdated);
    return () => window.removeEventListener("klodex:sessionTitleUpdated", handleTitleUpdated);
  }, [currentSession]);

  const currentProjectDir = currentSession?.project_dir || localStorage.getItem("klodex_project") || "";
  const currentProjectFolderName = useMemo(() => {
    if (!currentProjectDir) return "Выбрать папку проекта";
    const cleaned = currentProjectDir.replace(/[\\/]+$/, "");
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || cleaned;
  }, [currentProjectDir]);
  const loadSlashCommands = useCallback(async (dir?: string) => {
    try {
      const list = await api.slashCommands(dir);
      setSlashCommands(list || []);
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    void loadSlashCommands(currentProjectDir);
  }, [currentProjectDir, loadSlashCommands]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashQuery) return slashCommands;
    const q = slashQuery.toLowerCase();
    return slashCommands.filter(
      (c) =>
        (c.slash && c.slash.toLowerCase().includes(q)) ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [slashCommands, slashQuery]);

  useEffect(() => {
    setSlashSelectedIndex((prev) => {
      if (filteredSlashCommands.length === 0) return 0;
      return Math.min(prev, filteredSlashCommands.length - 1);
    });
  }, [filteredSlashCommands.length]);

  useEffect(() => {
    if (slashMenuOpen && slashListRef.current) {
      const activeEl = slashListRef.current.querySelector<HTMLElement>('[data-selected="true"]');
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [slashSelectedIndex, slashMenuOpen]);

  const runEventLoop = useCallback(
    async (
      generator: AsyncGenerator<AgentEvent>,
      sessionId: string,
      targetModel: string,
      opts?: { initialLiveId?: string; isReconnect?: boolean },
    ) => {
      const agg = new ChatAggregator();
      const liveId = opts?.initialLiveId || crypto.randomUUID();
      const startTime = Date.now();
      setLive({
        id: liveId,
        role: "assistant",
        parts: [],
        model: targetModel,
        pending: true,
        startedAt: startTime,
        statusText: `Подключение к ${targetModel}…`,
        stage: "connecting",
      });
      setStreaming(true);
      setError(null);
      setCurrentAgentAction(`Подключение к ${targetModel}…`);

      try {
        for await (const evt of generator) {
          const e: AgentEvent = evt;
          if (e.t === "status") {
            setLive((m) =>
              m
                ? {
                    ...m,
                    statusText: e.message,
                    stage: e.stage,
                    retryDelayMs: e.delayMs,
                  }
                : m,
            );
            setCurrentAgentAction(e.message);
          } else if (e.t === "text") {
            agg.text(e.d);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: "Печатает ответ…",
                    stage: "streaming",
                  }
                : m,
            );
            setCurrentAgentAction("Генерирует ответ…");
          } else if (e.t === "reason") {
            agg.reason(e.d);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: "Модель рассуждает…",
                    stage: "thinking",
                  }
                : m,
            );
            setCurrentAgentAction("Думает…");
          } else if (e.t === "tool") {
            agg.startTool(e.callId, e.name, e.input);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: `Выполняется ${e.name}…`,
                    stage: "tool",
                  }
                : m,
            );
            setCurrentAgentAction(`Вызывает: ${e.name}`);
          } else if (e.t === "toolres") {
            agg.finishTool(e.callId, e.name, e.output, e.isError);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: `${e.name} завершён`,
                    stage: "waiting",
                  }
                : m,
            );
            setCurrentAgentAction(`${e.name} завершён`);
          } else if (e.t === "swarm_start") {
            setMonitorOpen(true);
            setSwarmTelemetry({
              swarmId: e.swarmId,
              total: e.total,
              tasks: e.tasks.map((t: any) => ({
                id: t.id,
                agent: t.agent,
                model: t.model,
                prompt: t.prompt,
                status: "pending",
                action: "Ожидание запуска…",
              })),
              notes: [],
              messages: [],
              ok: 0,
              failed: 0,
            });
            setCurrentAgentAction(`Координирует рой (${e.total} агентов)`);
          } else if (e.t === "swarm_update") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                tasks: prev.tasks.map((t) =>
                  t.id === e.taskId
                    ? {
                        ...t,
                        status: e.status,
                        action: e.action ?? t.action,
                        preview: e.preview ?? t.preview,
                      }
                    : t,
                ),
              };
            });
          } else if (e.t === "swarm_note") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              const note = {
                author: e.author,
                key: e.key,
                time: new Date().toLocaleTimeString("ru", { minute: "2-digit", second: "2-digit" }),
              };
              return { ...prev, notes: [note, ...prev.notes] };
            });
          } else if (e.t === "swarm_msg") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              const msg = {
                from: e.from,
                to: e.to,
                time: new Date().toLocaleTimeString("ru", { minute: "2-digit", second: "2-digit" }),
              };
              return { ...prev, messages: [msg, ...prev.messages] };
            });
          } else if (e.t === "swarm_end") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              return { ...prev, ok: e.ok, failed: e.failed };
            });
            setCurrentAgentAction("Рой завершил работу");
          } else if (e.t === "finish") {
            setCurrentAgentAction(undefined);
            setMessages((m) => [
              ...m,
              { id: e.messageId || liveId, role: "assistant", parts: agg.parts } as UIMessage,
            ]);
          } else if (e.t === "title") {
            setCurrentSession((prev) => (prev ? { ...prev, title: e.title } : prev));
            window.dispatchEvent(
              new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: sessionId, title: e.title } }),
            );
            void reloadSessions();
          } else if (e.t === "error") {
            setCurrentAgentAction(undefined);
            setError(e.message);
            setLive(null);
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") {
          if (agg.parts.length) {
            setMessages((m) => [
              ...m,
              { id: liveId, role: "assistant", parts: agg.parts } as UIMessage,
            ]);
          }
        } else {
          setError(e.message);
        }
        setLive(null);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        setCurrentAgentAction(undefined);
        const msgs = await api.messages(sessionId).catch(() => []);
        setMessages(msgs.map((m) => m.data));
        setLive(null);
      }
    },
    [],
  );

  const loadSession = useCallback(async (id: string) => {
    abortRef.current?.abort();
    localStorage.setItem("klodex_active_session_id", id);
    const [row, msgs] = await Promise.all([
      api.session(id).catch(() => null),
      api.messages(id).catch(() => []),
    ]);
    if (!row) return;
    setCurrentSession(row);
    setMessages(msgs.map((m) => m.data));
    setLive(null);
    setError(null);
    // Auto-scroll to bottom ONLY when opening/switching a chat session
    setTimeout(() => {
      scrollToBottom("auto");
    }, 60);

    // Inspect messages to seed swarm telemetry if session had a swarm execution
    let foundSwarm: SwarmTelemetry | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const parts = msgs[i]?.data?.parts ?? [];
      const swarmPart = parts.find((p: any) => p.type === "tool-swarm");
      if (swarmPart && "input" in swarmPart) {
        const inp = (swarmPart as any).input;
        if (inp?.tasks && Array.isArray(inp.tasks)) {
          foundSwarm = {
            swarmId: null,
            total: inp.tasks.length,
            tasks: inp.tasks.map((t: any) => ({
              id: t.id,
              agent: t.agent,
              model: t.model,
              prompt: t.prompt,
              status: "done",
              action: "Выполнено",
            })),
            notes: [],
            messages: [],
            ok: inp.tasks.length,
            failed: 0,
          };
          break;
        }
      }
    }
    setSwarmTelemetry(foundSwarm);

    // Reconnect to active stream if agent is currently running for this session
    try {
      const active = await api.activeChat(id);
      if (active && "active" in active && active.active) {
        abortRef.current = new AbortController();
        const activeModel = (active as { model?: string }).model || `${row.provider ?? ""}/${row.model ?? ""}`;
        const streamGen = chatStreamReconnect(id, abortRef.current.signal);
        void runEventLoop(streamGen, id, activeModel, { isReconnect: true });
      }
    } catch {}
  }, [runEventLoop, scrollToBottom]);

  const newSession = useCallback(async () => {
    try {
      const dir = localStorage.getItem("klodex_project") || undefined;
      const row = await api.createSession(
        dir,
        selected?.provider,
        selected?.model,
      );
      localStorage.setItem("klodex_active_session_id", row.id);
      setCurrentSession(row);
      setMessages([]);
      setLive(null);
      setError(null);
      setSwarmTelemetry(null);
      setCurrentAgentAction(undefined);
      void reloadSessions();
      return row;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [reloadSessions, selected]);

  useEffect(() => {
    void reloadSessions();
    const saved = localStorage.getItem("klodex_active_session_id");
    if (saved && !currentSession) {
      void loadSession(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      void loadSession(id);
    };
    const onNew = () => {
      void newSession().then((row) => {
        if (row) void reloadSessions();
      });
    };
    const onDeleted = () => {
      localStorage.removeItem("klodex_active_session_id");
      setCurrentSession(null);
      setMessages([]);
      setLive(null);
      setError(null);
    };
    window.addEventListener("klodex:openSession", onOpen);
    window.addEventListener("klodex:newSession", onNew);
    window.addEventListener("klodex:sessionDeleted", onDeleted);
    return () => {
      window.removeEventListener("klodex:openSession", onOpen);
      window.removeEventListener("klodex:newSession", onNew);
      window.removeEventListener("klodex:sessionDeleted", onDeleted);
    };
  }, [loadSession, newSession, reloadSessions]);

  // report current session to the sidebar for active-item highlighting
  useEffect(() => {
    onCurrentSessionChange?.(currentSession?.id ?? null);
  }, [currentSession, onCurrentSessionChange]);


  const send = useCallback(
    async (text: string) => {
      if (streaming) return;
      if (isModelDeprecated) {
        setError(`Модель «${selected?.model}» временно не ворк (upstream блокировка OpenCode free tier). Выбери другую модель.`);
        return;
      }
      const prov = provider;
      if (!prov) { setError("нет провайдера"); return; }
      if (!prov.hasKey && prov.status !== "local" && prov.status !== "keyless") {
        setKeyDialog(prov.id);
        setKeyInputVal("");
        return;
      }
      let sessionId = currentSession?.id;
      if (!sessionId) {
        const row = await newSession();
        if (!row) return;
        sessionId = row.id;
      }
      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      setMessages((m) => [...m, userMsg]);
      setTimeout(() => {
        scrollToBottom("smooth");
      }, 50);

      abortRef.current = new AbortController();
      const modelStr = modelKey(selected!.provider, selected!.model);
      const streamGen = chatStream(
        { sessionId, message: text, model: modelStr },
        abortRef.current.signal,
      );
      await runEventLoop(streamGen, sessionId, modelStr);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, provider, selected, currentSession, newSession, runEventLoop, scrollToBottom],
  );

  async function loadMessages() {
    if (!currentSession) return;
    const msgs = await api.messages(currentSession.id).catch(() => []);
    setMessages(msgs.map((m) => m.data));
    setLive(null);
  }

  const saveKey = async () => {
    if (!keyDialog) return;
    try {
      await api.saveKey(keyDialog, keyInputVal.trim());
      await onCatalogRefresh();
      setKeyDialog(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteSession = async () => {
    if (!currentSession) return;
    if (!window.confirm("Удалить текущую сессию и историю сообщений?")) return;
    await api.deleteSession(currentSession.id);
    localStorage.removeItem("klodex_active_session_id");
    setCurrentSession(null);
    setMessages([]);
    setLive(null);
    void reloadSessions();
  };

  const handlePickProjectDir = async () => {
    try {
      const res = await api.pickFolderResult("Выбери папку проекта").catch(() => null);
      if (!res || res.cancelled || !res.path) return;
      const picked = res.path;
      if (currentSession) {
        await api.updateSession(currentSession.id, { projectDir: picked });
        setCurrentSession((prev) => (prev ? { ...prev, project_dir: picked } : null));
        void reloadSessions();
      } else {
        localStorage.setItem("klodex_project", picked);
        const s = await api.createSession(
          picked,
          selected?.provider,
          selected?.model,
        );
        void reloadSessions();
        await loadSession(s.id);
      }
    } catch (e) {
      console.error("pickFolder failed:", e);
    }
  };

  const handleExportMarkdown = useCallback(() => {
    if (messages.length === 0) return;
    const title = currentSession?.title || "Сессия Klodex";
    const date = new Date().toLocaleString("ru-RU");
    const model = `${selected?.provider || ""}/${selected?.model || ""}`;
    const dir = currentProjectDir || "не указан";

    let md = `# ${title}\n\n`;
    md += `- **Дата:** ${date}\n`;
    md += `- **Модель:** ${model}\n`;
    md += `- **Проект:** ${dir}\n\n---\n\n`;

    for (const m of messages) {
      const roleName = m.role === "user" ? "Пользователь" : "Klodex";
      md += `## ${roleName}\n\n`;
      for (const p of m.parts) {
        if (p.type === "text" && (p as any).text) {
          md += `${(p as any).text}\n\n`;
        } else if (p.type === "reasoning" && (p as any).text) {
          md += `> **Мысли модели:**\n> ${((p as any).text as string).split("\n").join("\n> ")}\n\n`;
        }
      }
      md += `---\n\n`;
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klodex-${currentSession?.id?.slice(0, 8) || "session"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, currentSession, selected, currentProjectDir]);

  const handleCopyLastAssistant = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant") {
        const texts = m.parts
          .filter((p) => p.type === "text" && typeof (p as any).text === "string")
          .map((p) => (p as any).text)
          .join("\n\n");
        if (texts.trim()) {
          void navigator.clipboard.writeText(texts.trim());
          return;
        }
      }
    }
  }, [messages]);

  const handleShowHelp = useCallback(() => {
    const stockHelp = [
      "`/clear` — Очистить чат и начать с нуля",
      "`/new` — Создать новую сессию",
      "`/project` — Выбрать рабочую папку проекта через диалог",
      "`/stop` — Прервать выполнение или генерацию",
      "`/monitor` — Открыть/скрыть панель телеметрии и ресурсов",
      "`/copy` — Скопировать последний ответ в буфер обмена",
      "`/export` — Экспортировать историю сессии в Markdown-файл",
      "`/settings` — Настройки провайдеров, моделей и ключей",
      "`/skills` — Каталог скиллов и промптов",
      "`/help` — Эта локальная справка",
    ];

    const customPrompts = slashCommands.filter((c) => !c.isStock);
    const promptsHelp = customPrompts.length > 0
      ? customPrompts.map((p) => `\`${p.slash || `/${p.name}`}\` — ${p.description || p.name} (${p.type === "composite" ? "мульти-промпт" : "промпт"})`)
      : ["*(Пользовательские промпты не установлены. Установи их через Каталог или добавь в `.klodex/prompts/`)*"];

    const helpText = `### Стоковые команды (локальные, без расхода токенов)
${stockHelp.join("\n")}

### Пользовательские промпты (для нейросети)
${promptsHelp.join("\n")}

### Горячие клавиши
- **Enter** — отправить сообщение
- **Shift + Enter** — перенос строки
- **↑ / ↓** — навигация по истории промптов (в пустом поле) или выбор команды в палитре
- **/** — открыть палитру команд
- **Tab / Enter** — применить выбранную команду
- **Esc** — закрыть палитру команд или остановить генерацию`;

    const helpMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: helpText }],
    };
    setMessages((prev) => [...prev, helpMsg]);
    setTimeout(() => scrollToBottom("smooth"), 50);
  }, [slashCommands, scrollToBottom]);

  const handleExecuteSlashCommand = useCallback(
    async (rawText: string): Promise<boolean> => {
      const match = rawText.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (!match) return false;
      const cmdName = (match[1] ?? "").toLowerCase();

      switch (cmdName) {
        case "clear":
          setMessages([]);
          setLive(null);
          setError(null);
          setSwarmTelemetry(null);
          setCurrentAgentAction(undefined);
          void newSession();
          return true;
        case "new":
          void newSession();
          return true;
        case "project":
        case "folder":
          void handlePickProjectDir();
          return true;
        case "stop":
          void abort();
          return true;
        case "monitor":
          setMonitorOpen((v) => !v);
          return true;
        case "copy":
          handleCopyLastAssistant();
          return true;
        case "export":
          handleExportMarkdown();
          return true;
        case "settings":
          window.dispatchEvent(new Event("klodex:openSettings"));
          return true;
        case "skills":
        case "catalog":
          window.dispatchEvent(new Event("klodex:openCatalog"));
          return true;
        case "help":
          handleShowHelp();
          return true;
        default:
          return false;
      }
    },
    [newSession, handlePickProjectDir, abort, handleCopyLastAssistant, handleExportMarkdown, handleShowHelp],
  );

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setSlashMenuOpen(false);
      const slashName = cmd.slash || `/${cmd.name}`;

      if (cmd.isStock) {
        void handleExecuteSlashCommand(slashName);
        if (textareaRef.current) {
          textareaRef.current.value = "";
          textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
          textareaRef.current.focus();
        }
      } else {
        if (textareaRef.current) {
          textareaRef.current.value = `${slashName} `;
          textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
          textareaRef.current.focus();
        }
      }
    },
    [handleExecuteSlashCommand],
  );

  /* ---- model selector ---- */
  const p = provider;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* topbar */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <input
                ref={titleInputRef}
                type="text"
                value={editingTitleVal}
                onChange={(e) => setEditingTitleVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveEditedTitle();
                  } else if (e.key === "Escape") {
                    setIsEditingTitle(false);
                  }
                }}
                onBlur={() => void saveEditedTitle()}
                className="h-6 w-full max-w-[320px] rounded border border-input bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Название сессии…"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-emerald-400 hover:text-emerald-300"
                onClick={() => void saveEditedTitle()}
                title="Сохранить (Enter)"
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditingTitle(false)}
                title="Отмена (Esc)"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="group/title flex items-center gap-1.5">
              <div
                className="truncate text-sm font-semibold cursor-pointer hover:text-foreground/90 transition-colors"
                onClick={startEditTitle}
                title="Нажми, чтобы изменить название чата"
              >
                {currentSession?.title ?? "Новая сессия"}
              </div>
              {currentSession && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/title:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={startEditTitle}
                    title="Переименовать чат"
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={isGeneratingTitle}
                    className="size-5 p-0 text-muted-foreground hover:text-primary"
                    onClick={handleGenerateTitle}
                    title="Сгенерировать название микро-моделью"
                  >
                    {isGeneratingTitle ? (
                      <Loader2 className="size-3 animate-spin text-primary" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
          {currentSession && (
            <div className="truncate text-muted-foreground font-mono text-xs">
              {currentSession.project_dir}
            </div>
          )}
        </div>
        {p && selected && (
          <div className="flex items-center gap-1.5 shrink-0">
            {p.id === "antigravity" && (
              <Badge
                variant="outline"
                className="hidden md:inline-flex h-7 px-2 text-[10px] text-violet-400 border-violet-500/30 bg-violet-500/10 gap-1 font-mono items-center shrink-0 select-none"
                title="Модели Antigravity используют локальный рантайм и инструменты Antigravity"
              >
                <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
                Antigravity tools
              </Badge>
            )}

            {/* Quick provider switch button that opens Settings */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new Event("klodex:openSettings"))}
              className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
              title="Изменить провайдера в настройках"
            >
              <span className="font-semibold text-foreground">{p.name}</span>
              <Settings2 className="size-3.5 opacity-60" />
            </Button>

            {/* Model dropdown for the current provider */}
            <Select
              value={selected.model}
              onValueChange={(val) => {
                onSelectedChange({ provider: p.id, model: val });
                localStorage.setItem("klodex_model", modelKey(p.id, val));
              }}
            >
              <SelectTrigger className="h-8 min-w-[170px] max-w-[280px] text-xs font-mono">
                <SelectValue placeholder="Выбери модель" />
              </SelectTrigger>
              <SelectContent align="end" className="max-h-[360px] chat-scroll">
                {p.models
                  .filter((m) => !m.deprecated && !["nemotron-3-ultra-free", "ll-alpha-free", "cat-jam-free"].includes(m.id))
                  .filter((m) => (!onlyFree ? true : m.free))
                  .map((m) => (
                    <SelectItem
                      key={m.id}
                      value={m.id}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono truncate">{m.name || m.id}</span>
                        {m.free && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] text-emerald-500 border-emerald-500/30"
                          >
                            free
                          </Badge>
                        )}
                        {p.id === "antigravity" && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] text-violet-400 border-violet-500/30 bg-violet-500/10"
                            title="Использует тулы и рантайм Antigravity"
                          >
                            antigravity tools
                          </Badge>
                        )}
                        {m.deprecated && (
                          <Badge
                            variant="destructive"
                            className="h-4 px-1 text-[9px] bg-destructive/15 text-destructive border-destructive/30"
                          >
                            не ворк
                          </Badge>
                        )}
                        {m.reasoning && (
                          <span title="Reasoning model" className="flex items-center">
                            <Brain className="size-3 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                {onlyFree && p.models.filter((m) => m.free).length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground text-center space-y-1.5">
                    <div>У {p.name} нет бесплатных моделей.</div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] w-full"
                      onClick={() => onSelectedChange({ provider: "opencode", model: "deepseek-v4.1-flash-free" })}
                    >
                      Переключить на OpenCode Free
                    </Button>
                  </div>
                )}
              </SelectContent>
            </Select>

            {/* Only Free toggle button */}
            <Button
              variant={onlyFree ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleToggleOnlyFree(!onlyFree)}
              className={cn(
                "h-8 text-xs gap-1.5 px-2 font-medium shrink-0 cursor-pointer",
                onlyFree
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Показывать только бесплатные модели (Free tier) у всех провайдеров"
            >
              <Sparkles className="size-3 text-emerald-500" />
              <span className="hidden sm:inline">Только Free</span>
              {onlyFree && <Check className="size-3 ml-0.5 text-emerald-500" />}
            </Button>
          </div>
        )}
        {p && !p.hasKey && p.status !== "local" && p.status !== "keyless" && (
          <Button variant="ghost" size="sm" onClick={() => setKeyDialog(p.id)} className="text-amber-500 text-xs">
            <KeyIcon className="size-3.5 mr-1" /> ключ
          </Button>
        )}
        <Button
          variant={monitorOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMonitorOpen((v) => !v)}
          className={cn(
            "h-7 text-xs gap-1.5 px-2 relative font-medium",
            monitorOpen ? "bg-accent text-accent-foreground border border-border/80" : "text-muted-foreground hover:text-foreground",
          )}
          title={monitorOpen ? "Скрыть панель агентов" : "Мониторинг агентов"}
        >
          <Cpu className="size-3.5" />
          <span className="hidden sm:inline">Агенты</span>
          {swarmTelemetry && swarmTelemetry.tasks.some((t) => t.status === "running") && (
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          {swarmTelemetry && swarmTelemetry.tasks.some((t) => t.status === "ratelimit") && (
            <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={newSession}
          title="Новая сессия"
        >
          <Plus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onCatalogRefresh} title="Перечитать каталог">
          <RotateCcw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={deleteSession}
          title="Удалить сессию"
          disabled={!currentSession}
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* messages */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
        <MessageScrollerProvider autoScroll={true}>
          <MessageScroller className="h-full">
            <MessageScrollerViewport className="chat-scroll">
              <MessageScrollerContent className="mx-auto max-w-3xl px-4 py-6">
                {messages.length === 0 && !live && (
                  <ChatEmptyState
                    providerName={p?.name}
                    modelName={selected?.model}
                    projectDir={currentSession?.project_dir || localStorage.getItem("klodex_project") || ""}
                    onSelectPrompt={(text) => void send(text)}
                    onOpenSettings={() => window.dispatchEvent(new Event("klodex:openSettings"))}
                    onPickProjectDir={handlePickProjectDir}
                  />
                )}
                {messages.map((m) => (
                  <MessageScrollerItem
                    key={m.id}
                    scrollAnchor={m.role === "user"}
                    messageId={m.id}
                  >
                    {m.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble align="end" variant="muted" className="max-w-[85%]">
                            <BubbleContent className="whitespace-pre-wrap">
                              {m.parts.map((pt, i) =>
                                pt.type === "text" ? <span key={i}>{pt.text}</span> : null,
                              )}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <AssistantMessage
                        msg={{
                          id: m.id,
                          role: "assistant",
                          parts: m.parts as any,
                          model: undefined,
                          pending: false,
                        }}
                        defaultOpenReasoning={reasoningDefaultOpen}
                      />
                    )}
                  </MessageScrollerItem>
                ))}
                {live && (
                  <MessageScrollerItem messageId={live.id} scrollAnchor>
                    <AssistantMessage msg={live} defaultOpenReasoning={reasoningDefaultOpen} />
                  </MessageScrollerItem>
                )}
                <div ref={messagesEndRef} className="h-px w-full" />
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      {error && (
        <div className="mx-4 mb-2 max-w-3xl shrink-0 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive self-center">
          {error}
        </div>
      )}

      {isModelDeprecated && (
        <div className="mx-auto mb-2 w-full max-w-3xl shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive flex items-center justify-between gap-3 shadow-xs">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>Модель <b>{selected?.model}</b> временно <b>не ворк</b> (заблокирована на апстриме OpenCode free tier). Отправка отключена.</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] shrink-0 border-destructive/30 hover:bg-destructive/20 text-destructive cursor-pointer font-medium"
            onClick={() => {
              onSelectedChange({ provider: "opencode", model: "deepseek-v4.1-flash-free" });
              localStorage.setItem("klodex_model", "opencode/deepseek-v4.1-flash-free");
            }}
          >
            Включить DeepSeek
          </Button>
        </div>
      )}

      {/* composer */}
      <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        {/* Slash Command Palette Popup */}
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div
            ref={slashListRef}
            className="absolute bottom-full left-4 right-4 mb-2 max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-2xl p-1.5 z-50 divide-y divide-border/20"
          >
            <div className="px-2 py-1.5 text-[11px] font-mono text-muted-foreground flex items-center justify-between border-b border-border/40 select-none">
              <span>Команды и промпты ({filteredSlashCommands.length})</span>
              <span className="text-[10px] opacity-75">↑↓ выбор • Tab/Enter применить • Esc закрыть</span>
            </div>
            <div className="py-1 space-y-0.5">
              {filteredSlashCommands.map((cmd, idx) => {
                const isSelected = idx === slashSelectedIndex;
                return (
                  <button
                    key={cmd.slash || cmd.name}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSlashSelectedIndex(idx)}
                    className={cn(
                      "w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-accent/50 text-foreground/90",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getSlashCommandIcon(cmd)}
                      <span className="font-mono font-semibold text-primary">
                        {cmd.slash || `/${cmd.name}`}
                      </span>
                      <span className="truncate text-muted-foreground text-[11px]">
                        {cmd.description || cmd.name}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      {cmd.isStock ? (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono">
                          действие
                        </Badge>
                      ) : cmd.type === "composite" ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400 bg-purple-500/10 font-mono"
                        >
                          мульти
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/10 font-mono"
                        >
                          промпт
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <PromptInput
          className="rounded-xl"
          onSubmit={async (m) => {
            const text = m.text?.trim();
            if (!text || isModelDeprecated) return;
            setSlashMenuOpen(false);
            const handledLocally = await handleExecuteSlashCommand(text);
            if (handledLocally) {
              if (textareaRef.current) {
                textareaRef.current.value = "";
                textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
              }
              return;
            }
            savePromptHistory(text);
            setHistoryIndex(-1);
            await send(text);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={
              isModelDeprecated
                ? "Выбранная модель не ворк — переключись на рабочую модель выше…"
                : "Опиши задачу… Enter — отправить, Shift+Enter — перенос, / — команды"
            }
            disabled={isModelDeprecated}
            onChange={(ev) => {
              const val = ev.target.value;
              if (val.startsWith("/")) {
                const parts = val.slice(1).split(/\s+/);
                if (parts.length > 1) {
                  setSlashMenuOpen(false);
                } else {
                  setSlashQuery(parts[0] || "");
                  setSlashMenuOpen(true);
                }
              } else {
                if (slashMenuOpen) {
                  setSlashMenuOpen(false);
                }
              }
            }}
            onKeyDown={(ev) => {
              if (slashMenuOpen && filteredSlashCommands.length > 0) {
                if (ev.key === "ArrowDown") {
                  ev.preventDefault();
                  setSlashSelectedIndex((prev) => (prev + 1) % filteredSlashCommands.length);
                  return;
                }
                if (ev.key === "ArrowUp") {
                  ev.preventDefault();
                  setSlashSelectedIndex(
                    (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
                  );
                  return;
                }
                if (ev.key === "Tab" || (ev.key === "Enter" && !ev.shiftKey)) {
                  ev.preventDefault();
                  const selectedCmd = filteredSlashCommands[slashSelectedIndex];
                  if (selectedCmd) {
                    selectCommand(selectedCmd);
                  }
                  return;
                }
                if (ev.key === "Escape") {
                  ev.preventDefault();
                  setSlashMenuOpen(false);
                  return;
                }
              }

              if (ev.key === "Enter" && !ev.shiftKey && !isModelDeprecated) {
                ev.preventDefault();
                (ev.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
              } else if (ev.key === "ArrowUp") {
                const target = ev.currentTarget;
                if (target.selectionStart === 0 && target.selectionEnd === 0) {
                  const hist = getPromptHistory();
                  if (hist.length > 0) {
                    const nextIdx = Math.min(historyIndex + 1, hist.length - 1);
                    setHistoryIndex(nextIdx);
                    target.value = hist[nextIdx];
                    target.dispatchEvent(new Event("input", { bubbles: true }));
                    ev.preventDefault();
                  }
                }
              } else if (ev.key === "ArrowDown") {
                const target = ev.currentTarget;
                if (historyIndex >= 0) {
                  const hist = getPromptHistory();
                  const nextIdx = historyIndex - 1;
                  setHistoryIndex(nextIdx);
                  target.value = nextIdx >= 0 ? hist[nextIdx] : "";
                  target.dispatchEvent(new Event("input", { bubbles: true }));
                  ev.preventDefault();
                }
              }
            }}
          />
          <PromptInputFooter className="justify-between gap-2 py-2">
            <PromptInputTools className="flex items-center gap-2 min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePickProjectDir}
                disabled={streaming}
                className="h-7 gap-1.5 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-pointer border-border/80 max-w-[220px] truncate shrink-0"
                title={currentProjectDir ? `Папка проекта: ${currentProjectDir} (нажми для смены через нативное окно)` : "Выбрать папку проекта через нативное окно"}
              >
                <FolderCode className="size-3.5 shrink-0 text-foreground/70" />
                <span className="truncate">{currentProjectFolderName}</span>
              </Button>

              {streaming ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abort}
                    className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0 cursor-pointer"
                  >
                    <Square className="size-3" /> Стоп
                  </Button>
                  <span className="text-muted-foreground text-[11px] truncate font-mono max-w-[200px] sm:max-w-[320px] animate-pulse">
                    {currentAgentAction || "Агент работает…"}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground text-[11px] truncate hidden md:inline ml-0.5">
                  {currentSession
                    ? `${selected?.provider}/${selected?.model}`
                    : "сессия создастся при первом сообщении"}
                </span>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={streaming ? "streaming" : "ready"}
              onStop={abort}
              disabled={isModelDeprecated}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>

    {/* right telemetry monitor */}
    <AgentMonitorPanel
      open={monitorOpen}
      onClose={() => setMonitorOpen(false)}
      mainAgent={{
        model: selected?.model || "не выбрана",
        status: streaming ? "running" : error ? "error" : "idle",
        currentAction: currentAgentAction,
        stage: live?.stage,
        elapsedMs: live?.startedAt ? Date.now() - live.startedAt : undefined,
      }}
      swarm={swarmTelemetry}
    />
  </div>

  {/* key dialog */}
      <Dialog open={!!keyDialog} onOpenChange={(o) => !o && setKeyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API-ключ для «{catalog.find((p) => p.id === keyDialog)?.name}»</DialogTitle>
            <DialogDescription>
              Сохранится локально в ~/.config/klodex/config.jsonc и сразу активирует провайдера.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="sk-…"
            value={keyInputVal}
            onChange={(e) => setKeyInputVal(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setKeyDialog(null)}>
              Отмена
            </Button>
            <Button onClick={saveKey}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
