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
  Eye,
  EyeOff,
  Zap,
  Archive,
  Coins,
  BarChart3,
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
import { AdcodeAuthCard } from "@/components/klodex/adcode-auth-card";
import { Streamdown } from "streamdown";

import {
  api,
  chatStream,
  chatStreamReconnect,
  modelKey,
  type AdcodeUsageInfo,
  type AgentEvent,
  type KlodexProvider,
  type ProviderSort,
  type SessionRow,
  type SlashCommand,
  type TokenStatsSummary,
} from "@/lib/api";
import { ChatAggregator, type LiveMessage, type ChatPart } from "@/lib/chat-aggregator";
import { ChatEmptyState } from "@/components/klodex/chat-empty-state";
import { AgentMonitorPanel, type SwarmTelemetry } from "@/components/klodex/agent-monitor-panel";
import { useI18n } from "@/lib/i18n";

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

function isCompactionMessage(m: UIMessage): boolean {
  if (m.id === "compact-notice" || m.id?.startsWith("compact-")) return true;
  return Boolean(
    m.parts?.some(
      (p: any) =>
        p.type === "text" &&
        typeof p.text === "string" &&
        (p.text.includes("была сжата для экономии контекста") || p.text.includes("was archived to free context")),
    ),
  );
}

function extractCompactionText(m: UIMessage): string {
  for (const p of m.parts || []) {
    if (p.type === "text" && typeof (p as any).text === "string") {
      const txt = (p as any).text;
      const match = txt.match(/\[\.\.\.\s*(.+?)\s*\.\.\.\]/);
      if (match) return match[1];
      return txt;
    }
  }
  return "Previous conversation was archived to free context";
}

/* ---------- live status badge ---------- */

function LiveStatusBadge({ msg }: { msg: LiveMessage }) {
  const { t, lang } = useI18n();
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
  const isCompacting = msg.stage === "compacting";

  return (
    <div className="space-y-1.5 pt-0.5">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium w-fit transition-colors",
          isRetry
            ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
            : isCompacting
            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
            : "border-primary/20 bg-primary/5 text-primary",
        )}
      >
        {isRetry ? (
          <AlertTriangle className="size-3.5 text-amber-500 animate-bounce shrink-0" />
        ) : isCompacting ? (
          <Archive className="size-3.5 text-cyan-400 animate-pulse shrink-0" />
        ) : isThinking ? (
          <Brain className="size-3.5 text-purple-400 animate-pulse shrink-0" />
        ) : isTool ? (
          <Wrench className="size-3.5 text-primary animate-spin shrink-0" />
        ) : (
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
        )}
        <span className="font-mono text-[11px]">
          {msg.statusText || (isCompacting ? t("chat.compacting") : isThinking ? t("chat.thinking") : (lang === "ru" ? "Думаю…" : "Thinking…"))}
        </span>
        {elapsedSec > 0 && (
          <span className="text-[10px] opacity-75 font-mono">({elapsedSec}{lang === "ru" ? "с" : "s"})</span>
        )}
      </div>

      {msg.pending && !msg.parts.length && (isRetry ? elapsedSec >= 8 : elapsedSec >= 25) && (
        <div className="text-[11px] text-muted-foreground/85 bg-muted/30 border border-border/40 rounded-md p-2.5 max-w-md leading-relaxed animate-in fade-in duration-300 space-y-1">
          <p className="font-medium text-foreground/90 flex items-center gap-1.5">
            <Clock className="size-3 text-muted-foreground" />
            <span>{t("chat.whySlow")}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isRetry
              ? t("chat.whySlowRateLimit")
              : t("chat.whySlowThinking")}
          </p>
        </div>
      )}
    </div>
  );
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  return (n || 0).toLocaleString();
}

/* ---------- assistant message ---------- */

function AssistantMessage({ msg, defaultOpenReasoning = false }: { msg: LiveMessage; defaultOpenReasoning?: boolean }) {
  const { t, lang } = useI18n();
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

        {msg.pending && (!msg.parts.length || msg.stage === "retry" || msg.stage === "compacting") && (
          <LiveStatusBadge msg={msg} />
        )}

        <MessageFooter className="text-muted-foreground text-[11px] pt-1 flex items-center justify-between">
          <span>{msg.model}</span>
          {(msg as any).usage && (
            <span
              className="font-mono text-[10px] text-muted-foreground/80 flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("klodex:openSettings", { detail: { tab: "stats" } }));
              }}
              title={t("chat.tokensSpent", {
                total: ((msg as any).usage.totalTokens || 0).toLocaleString(),
                prompt: ((msg as any).usage.promptTokens || 0).toLocaleString(),
                completion: ((msg as any).usage.completionTokens || 0).toLocaleString(),
                duration: (msg as any).usage.durationMs ? `, ${lang === "ru" ? "время ответа" : "duration"}: ${(((msg as any).usage.durationMs) / 1000).toFixed(1)}${lang === "ru" ? "с" : "s"}` : "",
              })}
            >
              <Coins className="size-3 text-muted-foreground" />
              <span>{((msg as any).usage.totalTokens || 0).toLocaleString()} tok</span>
              {(msg as any).usage.durationMs > 0 && (
                <span>• {((msg as any).usage.durationMs / 1000).toFixed(1)}{lang === "ru" ? "с" : "s"}</span>
              )}
            </span>
          )}
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
    if (id.includes("очистить") || id.includes("clear") || slash === "/clear") {
      return <Trash2 className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("новая") || id.includes("new") || slash === "/new") {
      return <Plus className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("папку") || id.includes("folder") || id.includes("project") || slash === "/project" || slash === "/folder") {
      return <FolderCode className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("остановить") || id.includes("stop") || slash === "/stop") {
      return <Square className="size-3.5 text-destructive shrink-0" />;
    }
    if (id.includes("монитор") || id.includes("monitor") || slash === "/monitor") {
      return <Activity className="size-3.5 text-violet-400 shrink-0" />;
    }
    if (id.includes("скопировать") || id.includes("copy") || slash === "/copy") {
      return <Copy className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("экспорт") || id.includes("export") || slash === "/export") {
      return <Download className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("настройки") || id.includes("settings") || slash === "/settings") {
      return <Settings2 className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("статистика") || id.includes("stats") || slash === "/stats") {
      return <BarChart3 className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("каталог") || id.includes("расширений") || id.includes("catalog") || id.includes("skills") || slash === "/skills" || slash === "/catalog") {
      return <Boxes className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("справка") || id.includes("help") || slash === "/help") {
      return <HelpCircle className="size-3.5 text-muted-foreground shrink-0" />;
    }
    if (id.includes("сжать") || id.includes("компакт") || id.includes("compact") || slash === "/compact") {
      return <Archive className="size-3.5 text-cyan-400 shrink-0" />;
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
  const { t, lang } = useI18n();
  const [currentSession, setCurrentSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [sessionTokens, setSessionTokens] = useState<TokenStatsSummary | null>(null);
  const [live, setLive] = useState<LiveMessage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compactNotice, setCompactNotice] = useState<string | null>(null);
  const [keyDialog, setKeyDialog] = useState<string | null>(null);
  const [keyInputVal, setKeyInputVal] = useState("");
  const [savingKeyDialog, setSavingKeyDialog] = useState(false);
  const [keyDialogError, setKeyDialogError] = useState<string | null>(null);
  const [showKeyDialogSecret, setShowKeyDialogSecret] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);
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

  const [tagflowUsage, setTagflowUsage] = useState<AdcodeUsageInfo | null>(null);

  const refreshTagflowUsage = useCallback(async () => {
    if (selected?.provider !== "tagflow") return;
    try {
      const res = await api.adcodeUsage();
      if (res.ok) setTagflowUsage(res);
    } catch {}
  }, [selected?.provider]);

  useEffect(() => {
    if (selected?.provider === "tagflow") {
      void refreshTagflowUsage();
      const interval = setInterval(() => {
        void refreshTagflowUsage();
      }, 25000);
      return () => clearInterval(interval);
    } else {
      setTagflowUsage(null);
    }
  }, [selected?.provider, refreshTagflowUsage]);

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
    () => (Array.isArray(catalog) ? catalog.find((p) => p.id === selected?.provider) ?? null : null),
    [catalog, selected],
  );

  const isModelDeprecated = useMemo(
    () => Boolean(Array.isArray(provider?.models) && provider.models.find((m) => m.id === selected?.model)?.deprecated),
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
    if (!currentProjectDir) return t("chat.pickProjectFolder");
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
        statusText: lang === "ru" ? `Подключение к ${targetModel}…` : `Connecting to ${targetModel}…`,
        stage: "connecting",
      });
      setStreaming(true);
      setError(null);
      setCurrentAgentAction(lang === "ru" ? `Подключение к ${targetModel}…` : `Connecting to ${targetModel}…`);

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
                    statusText: t("chat.streaming"),
                    stage: "streaming",
                  }
                : m,
            );
            setCurrentAgentAction(t("chat.streaming"));
          } else if (e.t === "reason") {
            agg.reason(e.d);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: t("chat.thinking"),
                    stage: "thinking",
                  }
                : m,
            );
            setCurrentAgentAction(t("chat.thinking"));
          } else if (e.t === "tool") {
            agg.startTool(e.callId, e.name, e.input);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: t("chat.tool", { tool: e.name }),
                    stage: "tool",
                  }
                : m,
            );
            setCurrentAgentAction(t("chat.tool", { tool: e.name }));
          } else if (e.t === "toolres") {
            agg.finishTool(e.callId, e.name, e.output, e.isError);
            setLive((m) =>
              m
                ? {
                    ...m,
                    parts: [...agg.parts],
                    statusText: t("chat.toolDone", { tool: e.name }),
                    stage: "waiting",
                  }
                : m,
            );
            setCurrentAgentAction(t("chat.toolDone", { tool: e.name }));
          } else if (e.t === "swarm_start") {
            setMonitorOpen(true);
            setSwarmTelemetry({
              swarmId: e.swarmId,
              total: e.total,
              tasks: e.tasks.map((tItem: any) => ({
                id: tItem.id,
                agent: tItem.agent,
                model: tItem.model,
                prompt: tItem.prompt,
                status: "pending",
                action: lang === "ru" ? "Ожидание запуска…" : "Waiting to launch…",
              })),
              notes: [],
              messages: [],
              ok: 0,
              failed: 0,
            });
            setCurrentAgentAction(lang === "ru" ? `Координирует рой (${e.total} агентов)` : `Coordinating swarm (${e.total} agents)`);
          } else if (e.t === "swarm_update") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                tasks: prev.tasks.map((tItem) =>
                  tItem.id === e.taskId
                    ? {
                        ...tItem,
                        status: e.status,
                        action: e.action ?? tItem.action,
                        preview: e.preview ?? tItem.preview,
                      }
                    : tItem,
                ),
              };
            });
          } else if (e.t === "swarm_note") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              const note = {
                author: e.author,
                key: e.key,
                time: new Date().toLocaleTimeString(lang === "ru" ? "ru" : "en-US", { minute: "2-digit", second: "2-digit" }),
              };
              return { ...prev, notes: [note, ...prev.notes] };
            });
          } else if (e.t === "swarm_msg") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              const msg = {
                from: e.from,
                to: e.to,
                time: new Date().toLocaleTimeString(lang === "ru" ? "ru" : "en-US", { minute: "2-digit", second: "2-digit" }),
              };
              return { ...prev, messages: [msg, ...prev.messages] };
            });
          } else if (e.t === "swarm_end") {
            setSwarmTelemetry((prev) => {
              if (!prev) return prev;
              return { ...prev, ok: e.ok, failed: e.failed };
            });
            setCurrentAgentAction(lang === "ru" ? "Рой завершил работу" : "Swarm completed");
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
          agg.abortPendingTools(lang === "ru" ? "Остановлено пользователем" : "Stopped by user");
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
        void api.adcodeUsage().then((res) => res.ok && setTagflowUsage(res)).catch(() => {});
        void api.sessionTokenStats(sessionId).then(setSessionTokens).catch(() => {});
      }
    },
    [],
  );

  const loadSession = useCallback(async (id: string) => {
    abortRef.current?.abort();
    localStorage.setItem("klodex_active_session_id", id);
    const [row, msgs, stats] = await Promise.all([
      api.session(id).catch(() => null),
      api.messages(id).catch(() => []),
      api.sessionTokenStats(id).catch(() => null),
    ]);
    if (!row) return;
    setCurrentSession(row);
    setMessages(msgs.map((m) => m.data));
    setSessionTokens(stats);
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
              action: t("chat.completed"),
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
      setSessionTokens(null);
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
      setSessionTokens(null);
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
        setError(t("chat.modelDownBanner", { model: selected?.model || "" }));
        return;
      }
      const prov = provider;
      if (!prov) { setError(t("chat.noProvider")); return; }
      if (!prov.hasKey && prov.status !== "local" && prov.status !== "keyless") {
        pendingMessageRef.current = text;
        setKeyDialog(prov.id);
        setKeyInputVal("");
        setKeyDialogError(null);
        setShowKeyDialogSecret(false);
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

  const cancelKeyDialog = () => {
    if (pendingMessageRef.current && textareaRef.current) {
      textareaRef.current.value = pendingMessageRef.current;
      textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
    pendingMessageRef.current = null;
    setKeyDialog(null);
    setKeyInputVal("");
    setKeyDialogError(null);
    setShowKeyDialogSecret(false);
  };

  const saveKey = async () => {
    if (!keyDialog) return;
    const val = keyInputVal.trim();
    if (!val) return;
    setSavingKeyDialog(true);
    setKeyDialogError(null);
    try {
      await api.saveKey(keyDialog, val);
      await onCatalogRefresh();
      const configuredProvId = keyDialog;
      const targetProv = Array.isArray(catalog) ? catalog.find((cp) => cp.id === configuredProvId) : null;
      if (targetProv && targetProv.models.length > 0) {
        const firstModel = targetProv.models[0].id;
        onSelectedChange({ provider: configuredProvId, model: firstModel });
        localStorage.setItem("klodex_model", modelKey(configuredProvId, firstModel));
      }
      const pendingText = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setKeyDialog(null);
      setKeyInputVal("");
      setShowKeyDialogSecret(false);
      if (pendingText) {
        setTimeout(() => {
          void send(pendingText);
        }, 120);
      }
    } catch (e: any) {
      setKeyDialogError(e?.message ?? t("chat.saveKeyError"));
    } finally {
      setSavingKeyDialog(false);
    }
  };

  const deleteSession = async () => {
    if (!currentSession) return;
    if (!window.confirm(t("chat.deleteSessionConfirm"))) return;
    await api.deleteSession(currentSession.id);
    localStorage.removeItem("klodex_active_session_id");
    setCurrentSession(null);
    setMessages([]);
    setSessionTokens(null);
    setLive(null);
    void reloadSessions();
  };

  const handlePickProjectDir = async () => {
    try {
      const res = await api.pickFolderResult(t("chat.pickProjectFolder")).catch(() => null);
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
    const title = currentSession?.title || (lang === "ru" ? "Сессия Klodex" : "Klodex Session");
    const date = new Date().toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
    const model = `${selected?.provider || ""}/${selected?.model || ""}`;
    const dir = currentProjectDir || (lang === "ru" ? "не указан" : "not specified");

    let md = `# ${title}\n\n`;
    md += `- **${lang === "ru" ? "Дата:" : "Date:"}** ${date}\n`;
    md += `- **${lang === "ru" ? "Модель:" : "Model:"}** ${model}\n`;
    md += `- **${lang === "ru" ? "Проект:" : "Project:"}** ${dir}\n\n---\n\n`;

    for (const m of messages) {
      const roleName = m.role === "user" ? (lang === "ru" ? "Пользователь" : "User") : "Klodex";
      md += `## ${roleName}\n\n`;
      for (const p of m.parts) {
        if (p.type === "text" && (p as any).text) {
          md += `${(p as any).text}\n\n`;
        } else if (p.type === "reasoning" && (p as any).text) {
          const reasoningHeader = lang === "ru" ? "Мысли модели:" : "Reasoning:";
          md += `> **${reasoningHeader}**\n> ${((p as any).text as string).split("\n").join("\n> ")}\n\n`;
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
  }, [messages, currentSession, selected, currentProjectDir, lang]);

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
    const stockHelp = lang === "ru" ? [
      "`/clear` — Очистить чат и начать с нуля",
      "`/new` — Создать новую сессию",
      "`/project` — Выбрать рабочую папку проекта через диалог",
      "`/stop` — Прервать выполнение или генерацию",
      "`/monitor` — Открыть/скрыть панель телеметрии и ресурсов",
      "`/copy` — Скопировать последний ответ в буфер обмена",
      "`/export` — Экспортировать историю сессии в Markdown-файл",
      "`/settings` — Настройки провайдеров, моделей и ключей",
      "`/stats` — Статистика расхода токенов и вызовов",
      "`/skills` — Каталог скиллов и промптов",
      "`/compact` — Сжать контекст диалога (архивация старых сообщений)",
      "`/help` — Эта локальная справка",
    ] : [
      "`/clear` — Clear chat and start fresh",
      "`/new` — Create a new session",
      "`/project` — Choose working project folder via dialog",
      "`/stop` — Abort execution or streaming",
      "`/monitor` — Toggle agent telemetry and resources panel",
      "`/copy` — Copy last assistant response to clipboard",
      "`/export` — Export session history to Markdown file",
      "`/settings` — Provider, model, and key settings",
      "`/stats` — Token usage and request statistics",
      "`/skills` — Skills and prompts catalog",
      "`/compact` — Compact dialogue context (archive older messages)",
      "`/help` — This local help guide",
    ];

    const customPrompts = slashCommands.filter((c) => !c.isStock);
    const multiLabel = lang === "ru" ? "мульти-промпт" : "multi-prompt";
    const promptLabel = lang === "ru" ? "промпт" : "prompt";
    const emptyPrompts = lang === "ru"
      ? ["*(Пользовательские промпты не установлены. Установи их через Каталог или добавь в `.klodex/prompts/`)*"]
      : ["*(No custom prompts installed. Install from Catalog or add to `.klodex/prompts/`)*"];

    const promptsHelp = customPrompts.length > 0
      ? customPrompts.map((p) => `\`${p.slash || `/${p.name}`}\` — ${p.description || p.name} (${p.type === "composite" ? multiLabel : promptLabel})`)
      : emptyPrompts;

    const helpText = lang === "ru" ? `### Стоковые команды (локальные, без расхода токенов)
${stockHelp.join("\n")}

### Пользовательские промпты (для нейросети)
${promptsHelp.join("\n")}

### Горячие клавиши
- **Enter** — отправить сообщение
- **Shift + Enter** — перенос строки
- **↑ / ↓** — навигация по истории промптов (в пустом поле) или выбор команды в палитре
- **/** — открыть палитру команд
- **Tab / Enter** — применить выбранную команду
- **Esc** — закрыть палитру команд или остановить генерацию`
    : `### Built-in Commands (local, zero token usage)
${stockHelp.join("\n")}

### Custom Prompts (sent to AI model)
${promptsHelp.join("\n")}

### Keyboard Shortcuts
- **Enter** — send message
- **Shift + Enter** — newline
- **↑ / ↓** — navigate prompt history (in empty field) or select command in palette
- **/** — open command palette
- **Tab / Enter** — apply selected command
- **Esc** — close command palette or stop generation`;

    const helpMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: helpText }],
    };
    setMessages((prev) => [...prev, helpMsg]);
    setTimeout(() => scrollToBottom("smooth"), 50);
  }, [slashCommands, scrollToBottom, lang]);

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
        case "stats":
          window.dispatchEvent(new CustomEvent("klodex:openSettings", { detail: { tab: "stats" } }));
          return true;
        case "skills":
        case "catalog":
          window.dispatchEvent(new Event("klodex:openCatalog"));
          return true;
        case "help":
          handleShowHelp();
          return true;
        case "compact":
          if (currentSession) {
            void (async () => {
              try {
                const res = await api.compact(currentSession.id);
                if (res.ok) {
                  const msgs = await api.messages(currentSession.id);
                  setMessages(msgs.map((m) => m.data));
                  const prunedStr = res.tokensPruned ? t("chat.compactSaved", { tokens: res.tokensPruned.toLocaleString() }) : "";
                  setCompactNotice(t("chat.compactNotice", { dropped: res.dropped, pruned: prunedStr }));
                  setTimeout(() => setCompactNotice(null), 5000);
                }
              } catch (err: any) {
                setError(t("chat.compactError", { error: err?.message || String(err) }));
              }
            })();
          }
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
                placeholder={t("chat.sessionNamePlaceholder")}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-emerald-400 hover:text-emerald-300"
                onClick={() => void saveEditedTitle()}
                title={t("chat.saveTitle")}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditingTitle(false)}
                title={t("chat.cancelTitle")}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="group/title flex items-center gap-1.5">
              <div
                className="truncate text-sm font-semibold cursor-pointer hover:text-foreground/90 transition-colors"
                onClick={startEditTitle}
                title={t("chat.clickToEditTitle")}
              >
                {currentSession?.title ?? t("chat.newSession")}
              </div>
              {currentSession && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover/title:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={startEditTitle}
                    title={t("chat.renameTooltip")}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={isGeneratingTitle}
                    className="size-5 p-0 text-muted-foreground hover:text-primary"
                    onClick={handleGenerateTitle}
                    title={t("chat.autoNameTooltip")}
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
                title={t("chat.antigravityToolsBadgeTooltip")}
              >
                <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
                Antigravity tools
              </Badge>
            )}

            {/* ADCode Included AI live token badge */}
            {p.id === "tagflow" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setKeyDialog("tagflow")}
                className={cn(
                  "h-8 gap-1.5 px-2.5 text-xs font-mono border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 cursor-pointer shrink-0 transition-colors",
                  tagflowUsage && typeof tagflowUsage.percentRemaining === "number" && tagflowUsage.percentRemaining < 15 && "border-amber-500/40 bg-amber-500/10 text-amber-400",
                )}
                title={
                  tagflowUsage && typeof tagflowUsage.remainingTokens === "number" && typeof tagflowUsage.dailyLimit === "number"
                    ? t("chat.adcodeTokensTooltip", {
                        remaining: tagflowUsage.remainingTokens.toLocaleString(),
                        limit: tagflowUsage.dailyLimit.toLocaleString(),
                        percent: tagflowUsage.percentRemaining ?? 100,
                      })
                    : t("chat.adcodeTokensTooltipDefault")
                }
              >
                <Zap className="size-3.5 fill-current text-emerald-400" />
                <span className="font-semibold">
                  {tagflowUsage && typeof tagflowUsage.remainingTokens === "number" && typeof tagflowUsage.dailyLimit === "number"
                    ? `${(tagflowUsage.remainingTokens / 1_000_000).toFixed(2)}M / ${(tagflowUsage.dailyLimit / 1_000_000).toFixed(1)}M`
                    : (lang === "ru" ? "2.0M токенов" : "2.0M tokens")}
                </span>
              </Button>
            )}

            {/* Session Token Usage Badge */}
            {currentSession && sessionTokens && sessionTokens.totalTokens > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("klodex:openSettings", { detail: { tab: "stats" } }));
                }}
                className="h-8 gap-1.5 px-2.5 text-xs font-mono border-border/80 bg-muted/20 hover:bg-muted/60 text-foreground/90 cursor-pointer shrink-0 transition-colors shadow-2xs"
                title={t("chat.sessionTokensTooltip", {
                  total: sessionTokens.totalTokens.toLocaleString(),
                  prompt: sessionTokens.promptTokens.toLocaleString(),
                  completion: sessionTokens.completionTokens.toLocaleString(),
                  requests: sessionTokens.requests,
                })}
              >
                <Coins className="size-3.5 text-muted-foreground" />
                <span className="font-semibold">
                  {formatTokensShort(sessionTokens.totalTokens)} tok
                </span>
              </Button>
            )}

            {/* Direct Provider selector for ready providers */}
            <Select
              value={p.id}
              onValueChange={(val) => {
                const target = Array.isArray(catalog) ? catalog.find((cp) => cp.id === val) : null;
                const isReady = Boolean(target && (target.hasKey || target.status === "keyless" || target.status === "local"));
                if (!isReady && target) {
                  setKeyDialog(val);
                  return;
                }
                if (target && target.models.length > 0) {
                  const firstModel = target.models[0].id;
                  onSelectedChange({ provider: val, model: firstModel });
                  localStorage.setItem("klodex_model", modelKey(val, firstModel));
                }
              }}
            >
              <SelectTrigger className="h-8 min-w-[130px] max-w-[210px] text-xs font-semibold">
                <SelectValue placeholder={t("chat.selectProvider")}>
                  {p.name || p.id}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-[360px] chat-scroll">
                {(Array.isArray(catalog) ? catalog : []).map((cp) => (
                  <SelectItem key={cp.id} value={cp.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold truncate">{cp.name}</span>
                      {cp.status === "local" ? (
                        <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-violet-400 border-violet-500/30">
                          local
                        </Badge>
                      ) : cp.status === "keyless" ? (
                        <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-emerald-400 border-emerald-500/30">
                          free
                        </Badge>
                      ) : cp.hasKey ? (
                        <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-emerald-400 border-emerald-500/30">
                          {t("chat.ready")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-amber-400 border-amber-500/30">
                          {t("chat.needKey")}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Quick settings button to configure keys or open settings */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.dispatchEvent(new Event("klodex:openSettings"))}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent/50 shrink-0"
              title={t("chat.settingsTooltip")}
            >
              <Settings2 className="size-3.5" />
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
                <SelectValue placeholder={t("chat.selectModel")}>
                  {p.models.find((m) => m.id === selected.model)?.name || selected.model || t("chat.selectModel")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-[360px] chat-scroll">
                {p.models
                  .filter((m) => m.id === selected.model || (!m.deprecated && !["nemotron-3-ultra-free", "ll-alpha-free", "cat-jam-free"].includes(m.id)))
                  .filter((m) => m.id === selected.model || (!onlyFree || !p.models.some((x) => x.free && !x.deprecated) ? true : m.free))
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
                            title={t("chat.antigravityToolsBadgeTooltip")}
                          >
                            antigravity tools
                          </Badge>
                        )}
                        {m.deprecated && (
                          <Badge
                            variant="destructive"
                            className="h-4 px-1 text-[9px] bg-destructive/15 text-destructive border-destructive/30"
                          >
                            {t("chat.notWorkingBadge")}
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
              </SelectContent>
            </Select>
          </div>
        )}
        {p && !p.hasKey && p.status !== "local" && p.status !== "keyless" && (
          <Button variant="ghost" size="sm" onClick={() => setKeyDialog(p.id)} className="text-amber-500 text-xs">
            <KeyIcon className="size-3.5 mr-1" /> {lang === "ru" ? "ключ" : "key"}
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
          title={monitorOpen ? t("chat.agentsHide") : t("chat.agentsMonitor")}
        >
          <Cpu className="size-3.5" />
          <span className="hidden sm:inline">{t("chat.agents")}</span>
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
          title={t("chat.newSession")}
        >
          <Plus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onCatalogRefresh} title={t("chat.refreshCatalogTooltip")}>
          <RotateCcw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={deleteSession}
          title={t("chat.deleteSessionTooltip")}
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
                {messages.map((m) => {
                  if (isCompactionMessage(m)) {
                    return (
                      <MessageScrollerItem key={m.id} messageId={m.id}>
                        <div className="my-3 flex items-center justify-center gap-2 select-none animate-in fade-in duration-200">
                          <div className="h-px bg-border/50 flex-1 max-w-[80px]" />
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[11px] font-mono shadow-xs">
                            <Archive className="size-3.5 shrink-0" />
                            <span>{extractCompactionText(m)}</span>
                          </div>
                          <div className="h-px bg-border/50 flex-1 max-w-[80px]" />
                        </div>
                      </MessageScrollerItem>
                    );
                  }
                  return (
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
                  );
                })}
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
        <div className="mx-4 mb-2 max-w-3xl shrink-0 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-xs text-destructive self-center flex items-center justify-between gap-3 shadow-xs">
          <span className="truncate">{error}</span>
          {(error.includes("too large") || error.includes("context-length") || error.includes("context")) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] border-destructive/40 hover:bg-destructive/20 text-destructive cursor-pointer font-medium"
                onClick={async () => {
                  if (!currentSession) return;
                  try {
                    const res = await api.compact(currentSession.id);
                    const msgs = await api.messages(currentSession.id);
                    const prunedStr = res.tokensPruned ? t("chat.compactSaved", { tokens: res.tokensPruned.toLocaleString() }) : "";
                    setCompactNotice(t("chat.compactNotice", { dropped: res.dropped, pruned: prunedStr }));
                    setTimeout(() => setCompactNotice(null), 5000);
                  } catch (err: any) {
                    setError(t("chat.compactError", { error: err?.message || String(err) }));
                  }
                }}
              >
                {t("chat.compactBtn")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] border-destructive/40 hover:bg-destructive/20 text-destructive cursor-pointer font-medium"
                onClick={() => void newSession()}
              >
                {t("chat.newChatBtn")}
              </Button>
            </div>
          )}
        </div>
      )}

      {compactNotice && (
        <div className="mx-4 mb-2 max-w-3xl shrink-0 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-400 self-center flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Archive className="size-3.5 shrink-0" />
            <span className="font-mono">{compactNotice}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
            onClick={() => setCompactNotice(null)}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {isModelDeprecated && (
        <div className="mx-auto mb-2 w-full max-w-3xl shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive flex items-center justify-between gap-3 shadow-xs">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{t("chat.modelDownBanner", { model: selected?.model || "" })}</span>
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
            {t("chat.switchDeepSeek")}
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
              <span>{t("chat.commandsAndPrompts", { count: filteredSlashCommands.length })}</span>
              <span className="text-[10px] opacity-75">{t("chat.commandsHint")}</span>
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
                          {t("chat.actionBadge")}
                        </Badge>
                      ) : cmd.type === "composite" ? (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400 bg-purple-500/10 font-mono"
                        >
                          {t("chat.multiBadge")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/10 font-mono"
                        >
                          {t("chat.promptBadge")}
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
                ? t("chat.inputPlaceholderModelDown")
                : t("chat.inputPlaceholder")
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
                title={
                  currentProjectDir
                    ? t("chat.projectFolderTooltip", { dir: currentProjectDir })
                    : t("chat.pickProjectFolderDialog")
                }
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
                    <Square className="size-3" /> {t("chat.stop")}
                  </Button>
                  <span className="text-muted-foreground text-[11px] truncate font-mono max-w-[200px] sm:max-w-[320px] animate-pulse">
                    {currentAgentAction || t("chat.agentWorking")}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground text-[11px] truncate hidden md:inline ml-0.5">
                  {currentSession
                    ? `${selected?.provider}/${selected?.model}`
                    : t("chat.firstMessageSessionNotice")}
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
        model: selected?.model || t("chat.modelNotSelected"),
        status: streaming ? "running" : error ? "error" : "idle",
        currentAction: currentAgentAction,
        stage: live?.stage,
        elapsedMs: live?.startedAt ? Date.now() - live.startedAt : undefined,
      }}
      swarm={swarmTelemetry}
    />
  </div>

  {/* key dialog */}
  <Dialog open={!!keyDialog} onOpenChange={(o) => !o && cancelKeyDialog()}>
    <DialogContent className="sm:max-w-[460px] p-6 gap-4">
      {keyDialog === "tagflow" ? (
        <AdcodeAuthCard
          onSuccess={async () => {
            await Promise.all([onCatalogRefresh(), refreshTagflowUsage()]);
            const pendingText = pendingMessageRef.current;
            pendingMessageRef.current = null;
            setKeyDialog(null);
            if (pendingText) {
              setTimeout(() => {
                void send(pendingText);
              }, 120);
            }
          }}
        />
      ) : (
        <>
          <DialogHeader className="gap-1.5">
            <div className="flex items-center gap-2 text-primary">
              <KeyIcon className="size-4" />
              <DialogTitle className="text-base font-semibold">
                {t("chat.keyDialogTitle", {
                  provider: (Array.isArray(catalog) ? catalog.find((p) => p.id === keyDialog)?.name : null) ?? keyDialog ?? "",
                })}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {keyDialog === "openrouter" ? (
                <span>
                  {lang === "ru" ? (
                    <>
                      Ключ для моделей OpenRouter (получи на{" "}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        openrouter.ai/keys
                      </a>
                      , для бесплатных моделей баланс $0).
                    </>
                  ) : (
                    <>
                      Key for OpenRouter models (get at{" "}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        openrouter.ai/keys
                      </a>
                      , $0 balance is sufficient for free models).
                    </>
                  )}
                </span>
              ) : (
                t("chat.keyDialogLocalDesc")
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showKeyDialogSecret ? "text" : "password"}
                placeholder={keyDialog === "openrouter" ? t("chat.keyInputPlaceholderOpenRouter") : t("chat.keyInputPlaceholder")}
                value={keyInputVal}
                onChange={(e) => setKeyInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void saveKey();
                  }
                }}
                className="pr-9 font-mono text-xs h-9"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKeyDialogSecret((v) => !v)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                tabIndex={-1}
              >
                {showKeyDialogSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {keyDialogError && (
              <p className="text-xs text-destructive leading-relaxed font-medium">
                {keyDialogError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={cancelKeyDialog} disabled={savingKeyDialog}>
              {t("chat.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={saveKey}
              disabled={!keyInputVal.trim() || savingKeyDialog}
              className="gap-1.5"
            >
              {savingKeyDialog && <Loader2 className="size-3.5 animate-spin" />}
              <span>{savingKeyDialog ? t("chat.savingKey") : t("chat.keyDialogSaveAndContinue")}</span>
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  </Dialog>
    </div>
  );
}
