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

        {msg.pending && !msg.parts.length && (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary font-medium w-fit">
            <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
            <span className="animate-pulse">Думаю…</span>
          </div>
        )}

        <MessageFooter className="text-muted-foreground text-[11px] pt-1">
          {msg.model}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
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
  const [reasoningDefaultOpen, setReasoningDefaultOpen] = useState(() => {
    return localStorage.getItem("klodex_reasoning_default_open") === "true";
  });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setReasoningDefaultOpen(detail);
    };
    window.addEventListener("klodex:reasoningDefaultChanged", handler);
    return () => window.removeEventListener("klodex:reasoningDefaultChanged", handler);
  }, []);

  const provider = useMemo(
    () => catalog.find((p) => p.id === selected?.provider) ?? null,
    [catalog, selected],
  );

  const isModelDeprecated = useMemo(
    () => Boolean(provider?.models.find((m) => m.id === selected?.model)?.deprecated),
    [provider, selected],
  );

  const currentProjectDir = currentSession?.project_dir || localStorage.getItem("klodex_project") || "";
  const currentProjectFolderName = useMemo(() => {
    if (!currentProjectDir) return "Выбрать папку проекта";
    const cleaned = currentProjectDir.replace(/[\\/]+$/, "");
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || cleaned;
  }, [currentProjectDir]);

  const runEventLoop = useCallback(
    async (
      generator: AsyncGenerator<AgentEvent>,
      sessionId: string,
      targetModel: string,
      opts?: { initialLiveId?: string; isReconnect?: boolean },
    ) => {
      const agg = new ChatAggregator();
      const liveId = opts?.initialLiveId || crypto.randomUUID();
      setLive({
        id: liveId,
        role: "assistant",
        parts: [],
        model: targetModel,
        pending: true,
      });
      setStreaming(true);
      setError(null);
      setCurrentAgentAction(undefined);

      try {
        for await (const evt of generator) {
          const e: AgentEvent = evt;
          if (e.t === "text") {
            agg.text(e.d);
            setLive((m) => (m ? { ...m, parts: [...agg.parts] } : m));
            setCurrentAgentAction("Генерирует ответ…");
          } else if (e.t === "reason") {
            agg.reason(e.d);
            setLive((m) => (m ? { ...m, parts: [...agg.parts] } : m));
            setCurrentAgentAction("Думает…");
          } else if (e.t === "tool") {
            agg.startTool(e.callId, e.name, e.input);
            setLive((m) => (m ? { ...m, parts: [...agg.parts] } : m));
            setCurrentAgentAction(`Вызывает: ${e.name}`);
          } else if (e.t === "toolres") {
            agg.finishTool(e.callId, e.name, e.output, e.isError);
            setLive((m) => (m ? { ...m, parts: [...agg.parts] } : m));
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
            setLive(null);
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

  const abort = useCallback(async () => {
    abortRef.current?.abort();
    if (currentSession) void api.stop(currentSession.id).catch(() => {});
  }, [currentSession]);

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
    await api.deleteSession(currentSession.id);
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

  /* ---- model selector ---- */
  const p = provider;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* topbar */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {currentSession?.title ?? "Новая сессия"}
          </div>
          {currentSession && (
            <div className="truncate text-muted-foreground font-mono text-xs">
              {currentSession.project_dir}
            </div>
          )}
        </div>
        {p && selected && (
          <div className="flex items-center gap-1.5 shrink-0">
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
                {p.models.filter((m) => !m.deprecated && m.id !== "muse-spark-1.3-contributor-free").map((m) => (
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
                      {m.deprecated && (
                        <Badge
                          variant="destructive"
                          className="h-4 px-1 text-[9px] bg-destructive/15 text-destructive border-destructive/30"
                        >
                          не ворк
                        </Badge>
                      )}
                      {m.reasoning && (
                        <span title="Reasoning model" className="text-[10px]">
                          🧠
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
        <MessageScrollerProvider autoScroll={false}>
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
                  <MessageScrollerItem messageId={live.id}>
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
          <span>⚠️ Модель <b>{selected?.model}</b> временно <b>не ворк</b> (заблокирована на апстриме OpenCode free tier). Отправка отключена.</span>
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
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <PromptInput
          className="rounded-xl"
          onSubmit={async (m) => {
            const text = m.text?.trim();
            if (!text || isModelDeprecated) return;
            await send(text);
          }}
        >
          <PromptInputTextarea
            placeholder={
              isModelDeprecated
                ? "Выбранная модель не ворк — переключись на рабочую модель выше…"
                : "Опиши задачу… Enter — отправить, Shift+Enter — новая строка"
            }
            disabled={streaming || isModelDeprecated}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey && !isModelDeprecated) {
                ev.preventDefault();
                (ev.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
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
                <Button variant="outline" size="sm" onClick={abort} className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0">
                  <Square className="size-3" /> Стоп
                </Button>
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
              disabled={streaming || isModelDeprecated}
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
