import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Cpu,
  FolderCode,
  Gauge,
  Key as KeyIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

import {
  api,
  chatStream,
  chatStreamReconnect,
  modelKey,
  type AdcodeUsageInfo,
  type AgentEvent,
  type KlodexProvider,
  type SessionRow,
  type SlashCommand,
  type TokenStatsSummary,
} from "@/lib/api";
import { ChatAggregator, type LiveMessage } from "@/lib/chat-aggregator";
import { StudioAssistantMessage } from "@/studio/activity-timeline";
import { ChatEmptyState } from "@/components/klodex/chat-empty-state";
import { WorkspacePanel } from "@/components/klodex/workspace-panel";
import { AgentMonitorPanel, type SwarmTelemetry } from "@/components/klodex/agent-monitor-panel";
import { ModelPickerPopover } from "@/studio/model-picker-popover";
import { useI18n, localizeStatusMessage, localizeSwarmAction } from "@/lib/i18n";

interface Props {
  catalog: KlodexProvider[];
  onCatalogRefresh: () => void;
  sessions: SessionRow[];
  reloadSessions: () => void;
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  onCurrentSessionChange: (id: string | null) => void;
  onOpenCatalog: () => void;
  onOpenSettings?: (tab?: "general" | "provider" | "keys") => void;
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function isCompactionMessage(m: UIMessage): boolean {
  if (m.id === "compact-notice" || m.id?.startsWith("compact-") || m.id === "context-summary") return true;
  if ((m as any).role === "system") return true;
  return Boolean(
    m.parts?.some(
      (p: any) =>
        p.type === "text" &&
        typeof p.text === "string" &&
        (p.text.includes("была сжата") ||
          p.text.includes("was archived") ||
          p.text.includes("для экономии контекста") ||
          p.text.includes("для соблюдения лимита") ||
          p.text.includes("для освобождения контекста") ||
          p.text.includes("Предыдущая часть переписки") ||
          p.text.includes("Предыдущая часть диалога")),
    ),
  );
}

export function SystemCompactionMessage({ message, lang }: { message: UIMessage; lang: string }) {
  const [showDetails, setShowDetails] = useState(false);

  const fullText = useMemo(() => {
    return (
      message.parts
        ?.filter((p: any) => p.type === "text" && typeof p.text === "string")
        .map((p: any) => p.text)
        .join("\n\n") || ""
    );
  }, [message.parts]);

  const noticeTitle = useMemo(() => {
    const match = fullText.match(/\[\.\.\.\s*(.+?)\s*\.\.\.\]/);
    if (match) return match[1];
    return lang === "ru"
      ? "Контекст диалога оптимизирован для освобождения лимита модели"
      : "Conversation context was compacted to free model budget";
  }, [fullText, lang]);

  const summaryBody = useMemo(() => {
    let clean = fullText.replace(/\[\.\.\.\s*.+?\s*\.\.\.\]\s*/g, "").trim();
    return clean || fullText;
  }, [fullText]);

  const hasBody = summaryBody.length > 20 && summaryBody !== noticeTitle;

  return (
    <div className="my-5 mx-auto w-full max-w-2xl select-none animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
              <Archive className="size-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                  {lang === "ru" ? "Системное событие" : "System Event"}
                </span>
                <span className="size-1 rounded-full bg-cyan-400/60" />
                <span className="text-[11px] font-medium text-foreground/90 truncate">
                  {lang === "ru" ? "Сжатие контекста" : "Context Compacted"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{noticeTitle}</p>
            </div>
          </div>

          {hasBody && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 active:scale-95"
            >
              <span>{showDetails ? (lang === "ru" ? "Скрыть" : "Hide") : (lang === "ru" ? "Выжимка" : "Summary")}</span>
              <ChevronDown className={cn("size-3 transition-transform duration-200", showDetails && "rotate-180")} />
            </button>
          )}
        </div>

        {showDetails && hasBody && (
          <div className="mt-3 border-t border-cyan-500/20 pt-2.5">
            <div className="rounded-lg bg-background/60 p-3 font-sans text-xs leading-relaxed text-foreground/90 border border-border/40 select-text">
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase text-cyan-400/80">
                {lang === "ru" ? "Сохраненная выжимка памяти модели:" : "Retained memory summary:"}
              </div>
              <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                {summaryBody}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getEstimatedContextWindow(modelId?: string, providerId?: string): number {
  if (!modelId) return 128000;
  const m = modelId.toLowerCase();
  const p = (providerId || "").toLowerCase();
  if (p === "tagflow") {
    if (m.includes("glm")) return 81072;
    if (m.includes("code-27b")) return 262144;
    return 131072;
  }
  if (p === "xplabs" || m.includes("glm-5.3") || m.includes("glm-4")) return 131072;
  if (m.includes("gemini")) return 1000000;
  if (m.includes("claude") || m.includes("sonnet") || m.includes("opus")) return 200000;
  if (m.includes("deepseek")) return 65536;
  if (m.includes("gpt-4o") || m.includes("o1") || m.includes("o3")) return 128000;
  if (m.includes("qwen")) return 131072;
  return 128000;
}

function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

interface ContextTelemetryBadgeProps {
  usedTokens: number;
  contextWindow: number;
  percentFree: number;
  sessionTokens: TokenStatsSummary | null;
  onCompact: () => void;
  disabled?: boolean;
  lang: string;
}

function ContextTelemetryBadge({
  usedTokens,
  contextWindow,
  percentFree,
  sessionTokens,
  onCompact,
  disabled,
  lang,
}: ContextTelemetryBadgeProps) {
  const isWarning = percentFree < 35 && percentFree >= 15;
  const isDanger = percentFree < 15;

  const colorClass = isDanger
    ? "text-rose-400 bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20"
    : isWarning
      ? "text-amber-400 bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20"
      : "text-emerald-400/90 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] font-medium transition-colors",
            colorClass,
            disabled && "cursor-not-allowed opacity-50"
          )}
          title={
            lang === "ru"
              ? `Контекст: ${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} токенов (${percentFree}% свободно)`
              : `Context: ${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens (${percentFree}% free)`
          }
        >
          <Gauge className="size-3 shrink-0" />
          <span>
            {formatTokensCompact(usedTokens)} / {formatTokensCompact(contextWindow)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-3 font-sans shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
            <Gauge className="size-3.5 text-primary" />
            <span>{lang === "ru" ? "Окно контекста" : "Context Window"}</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-primary">
            {percentFree}% {lang === "ru" ? "свободно" : "free"}
          </span>
        </div>

        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              isDanger ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(100, Math.max(0, 100 - percentFree))}%` }}
          />
        </div>

        <div className="mt-3 space-y-1.5 font-mono text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>{lang === "ru" ? "Использовано" : "Used tokens"}:</span>
            <span className="text-foreground">{usedTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{lang === "ru" ? "Осталось" : "Remaining"}:</span>
            <span className="text-foreground">{Math.max(0, contextWindow - usedTokens).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{lang === "ru" ? "Лимит модели" : "Model limit"}:</span>
            <span className="text-foreground">{contextWindow.toLocaleString()}</span>
          </div>
          {sessionTokens && (
            <div className="border-t border-border/40 pt-1.5 flex justify-between text-[11px] text-muted-foreground/80">
              <span>Prompt / Completion:</span>
              <span>
                {sessionTokens.promptTokens.toLocaleString()} / {sessionTokens.completionTokens.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-border/50 pt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground leading-tight">
            {lang === "ru" ? "Автосжатие при переполнении" : "Auto-compacts on limit"}
          </span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onCompact}
            className="cursor-pointer gap-1 text-[11px] font-mono h-6 px-2"
          >
            <Archive className="size-3" />
            {lang === "ru" ? "Сжать" : "Compact"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserMessageBubble({
  message,
  lang,
}: {
  message: UIMessage;
  lang: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const text = useMemo(
    () => message.parts.map((pt) => (pt.type === "text" ? pt.text : "")).join(""),
    [message.parts]
  );

  const lineCount = useMemo(() => text.split("\n").length, [text]);
  const isPotentiallyLong = text.length > 300 || lineCount > 5;

  useLayoutEffect(() => {
    if (textRef.current) {
      setIsOverflowing(textRef.current.scrollHeight > 140);
    }
  }, [text]);

  const shouldClamp = (isPotentiallyLong || isOverflowing) && !expanded;

  return (
    <div className="flex justify-end">
      <div className="group/user-msg relative max-w-[85%] rounded-2xl rounded-br-md bg-primary/12 px-4 py-2.5 text-sm leading-relaxed text-foreground ring-1 ring-primary/15 animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div
          ref={textRef}
          className={cn(
            "whitespace-pre-wrap break-words transition-all duration-200",
            shouldClamp && "max-h-32 overflow-hidden"
          )}
        >
          {message.parts.map((pt, i) => (pt.type === "text" ? <span key={i}>{pt.text}</span> : null))}
        </div>

        {shouldClamp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center rounded-b-2xl bg-gradient-to-t from-background via-background/70 to-transparent pb-1.5 pt-6">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/20 px-3 py-1 font-mono text-[11px] font-medium text-foreground backdrop-blur-md transition-all hover:bg-primary/30 hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
            >
              <ChevronDown className="size-3 text-primary" />
              <span>
                {lang === "ru"
                  ? `Развернуть (${text.length > 1000 ? `${(text.length / 1000).toFixed(1)}k симв.` : `${lineCount} строк`})`
                  : `Show more (${text.length > 1000 ? `${(text.length / 1000).toFixed(1)}k chars` : `${lineCount} lines`})`}
              </span>
            </button>
          </div>
        )}

        {expanded && (isPotentiallyLong || isOverflowing) && (
          <div className="mt-2 flex justify-end border-t border-primary/15 pt-1.5">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:bg-primary/10 cursor-pointer"
            >
              <ChevronUp className="size-3" />
              <span>{lang === "ru" ? "Свернуть" : "Show less"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface AdcodeQuickWidgetProps {
  onOpenFullSettings: () => void;
  lang: string;
}

function AdcodeQuickWidget({ onOpenFullSettings, lang }: AdcodeQuickWidgetProps) {
  const [usage, setUsage] = useState<AdcodeUsageInfo | null>(null);
  const [accounts, setAccounts] = useState<Array<{ email: string; createdAt: number; active: boolean }>>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([
        api.adcodeUsage().catch(() => null),
        api.adcodeGetAccounts().catch(() => null),
      ]);
      if (u && u.ok) setUsage(u);
      if (a && a.accounts) {
        setAccounts(a.accounts);
        setActiveEmail(a.activeEmail);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSwitch = async (email: string) => {
    setSwitching(email);
    try {
      await api.adcodeSwitchAccount(email);
      await loadData();
    } catch {} finally {
      setSwitching(null);
    }
  };

  const handleAutoCreate = async () => {
    setAutoGenerating(true);
    setAutoStatus(lang === "ru" ? "Запуск создания…" : "Starting…");
    try {
      const res = await api.adcodeAutoAccountStream((step) => {
        setAutoStatus(step);
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err: any) {
      setAutoStatus(err?.message || (lang === "ru" ? "Сбой создания" : "Failed"));
    } finally {
      setTimeout(() => {
        setAutoGenerating(false);
        setAutoStatus(null);
      }, 900);
    }
  };

  const remaining = usage?.remainingTokens ?? 2_000_000;
  const limit = usage?.dailyLimit ?? 2_000_000;
  const percent = usage?.percentRemaining ?? Math.round((remaining / limit) * 100);
  const isLow = percent < 20;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) void loadData(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-mono text-[11px] font-medium transition-colors",
            isLow
              ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          )}
          title={lang === "ru" ? `ADCode: ${remaining.toLocaleString()} токенов (${activeEmail || ""})` : `ADCode: ${remaining.toLocaleString()} tokens (${activeEmail || ""})`}
        >
          <Zap className="size-3 shrink-0 text-emerald-400 fill-emerald-400/30" />
          <span>
            {(remaining / 1_000_000).toFixed(2)}M
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-3 font-sans shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
            <Zap className="size-3.5 text-emerald-400 fill-emerald-400/40" />
            <span>ADCode Included AI</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-emerald-400">
            {percent}% {lang === "ru" ? "осталось" : "left"}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              isLow ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{remaining.toLocaleString()} токенов</span>
          <span>Лимит: {limit.toLocaleString()} / сут.</span>
        </div>

        {/* Accounts List & Switcher */}
        <div className="mt-3 border-t border-border/50 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              {lang === "ru" ? "Аккаунты (свап в 1 клик):" : "Accounts (1-click swap):"}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {accounts.length} {lang === "ru" ? "акк." : "acc."}
            </span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5 chat-scroll">
            {accounts.map((acc) => {
              const isActive = acc.email === activeEmail;
              const isSwitchingThis = switching === acc.email;
              return (
                <button
                  key={acc.email}
                  type="button"
                  disabled={isActive || switching !== null}
                  onClick={() => handleSwitch(acc.email)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default"
                      : "hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn("size-1.5 rounded-full shrink-0", isActive ? "bg-emerald-400" : "bg-muted-foreground/40")} />
                    <span className="truncate">{acc.email}</span>
                  </div>
                  {isSwitchingThis ? (
                    <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
                  ) : isActive ? (
                    <span className="text-[10px] font-sans font-semibold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                      {lang === "ru" ? "активен" : "active"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 hover:text-foreground shrink-0">
                      {lang === "ru" ? "выбрать" : "switch"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 border-t border-border/50 pt-2 flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="default"
            disabled={autoGenerating}
            onClick={handleAutoCreate}
            className="flex-1 cursor-pointer gap-1.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium h-7 truncate"
          >
            {autoGenerating ? (
              <>
                <Loader2 className="size-3 animate-spin shrink-0" />
                <span className="truncate">{autoStatus || (lang === "ru" ? "Создание аккаунта…" : "Creating account…")}</span>
              </>
            ) : (
              <>
                <Plus className="size-3 shrink-0" />
                <span>{lang === "ru" ? "+ Новый авто-аккаунт" : "+ New Auto Account"}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              onOpenFullSettings();
            }}
            className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground h-7 px-2"
            title={lang === "ru" ? "Открыть настройки ADCode" : "Open ADCode settings"}
          >
            <Settings2 className="size-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ══════════════════════════════════════════════════
   Studio Chat — from-scratch engine & surface
   ══════════════════════════════════════════════════ */

export function StudioChat({
  catalog,
  onCatalogRefresh,
  reloadSessions,
  selected,
  onSelectedChange,
  onCurrentSessionChange,
  onOpenCatalog,
  onOpenSettings,
}: Props) {
  const { lang, t } = useI18n();

  // ── core state ──
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [live, setLive] = useState<LiveMessage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<SessionRow | null>(null);
  const [sessionTokens, setSessionTokens] = useState<TokenStatsSummary | null>(null);
  const [tagflowUsage, setTagflowUsage] = useState<any>(null);
  const [swarmTelemetry, setSwarmTelemetry] = useState<SwarmTelemetry | null>(null);
  const [currentAgentAction, setCurrentAgentAction] = useState<string | undefined>(undefined);
  const [compactNotice, setCompactNotice] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  // unified right dock: "workspace" | "agents" | null — one slot, one active tab
  const [dockTab, setDockTab] = useState<"workspace" | "agents" | null>(null);
  const [, setReasoningDefaultOpen] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);

  // key dialog
  const [keyDialog, setKeyDialog] = useState<string | null>(null);
  const [keyInputVal, setKeyInputVal] = useState("");
  const [keyDialogError, setKeyDialogError] = useState<string | null>(null);
  const [savingKeyDialog, setSavingKeyDialog] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // composer
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleVal, setEditingTitleVal] = useState("");

  const provider = useMemo(
    () => (Array.isArray(catalog) ? catalog.find((p) => p.id === selected?.provider) ?? null : null),
    [catalog, selected],
  );
  const isModelDeprecated = useMemo(
    () => Boolean(Array.isArray(provider?.models) && provider.models.find((m) => m.id === selected?.model)?.deprecated),
    [provider, selected],
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [hasNewWhileScrolled, setHasNewWhileScrolled] = useState(false);
  const [liveTps, setLiveTps] = useState<number>(0);

  const contextWindow = useMemo(() => {
    const m = provider?.models?.find((x) => x.id === selected?.model);
    if (m?.contextWindow && m.contextWindow > 0) return m.contextWindow;
    return getEstimatedContextWindow(selected?.model, selected?.provider);
  }, [provider, selected]);

  const usedTokens = useMemo(() => {
    let chars = 0;
    for (const m of messages) {
      if (m.parts) {
        for (const p of m.parts) {
          if (p.type === "text" && p.text) chars += p.text.length;
        }
      }
    }
    return Math.max(1, Math.round(chars / 3.8));
  }, [messages]);

  const percentFree = useMemo(() => {
    const remaining = Math.max(0, contextWindow - usedTokens);
    return Math.max(0, Math.min(100, Math.round((remaining / contextWindow) * 100)));
  }, [contextWindow, usedTokens]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Strict bottom detection: only within 20px of the bottom edge
    const threshold = 20;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= threshold;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(distanceFromBottom > 35);
    if (nearBottom) {
      setHasNewWhileScrolled(false);
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // If the user wheels UP (deltaY < 0), immediately freeze autoscroll so nothing jerks them down
    if (e.deltaY < 0) {
      isNearBottomRef.current = false;
      setShowScrollBottom(true);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setHasNewWhileScrolled(false);
  }, []);

  // Auto-scroll when messages update or during live streaming ONLY when user is at the very bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (isNearBottomRef.current && distanceFromBottom <= 20) {
      el.scrollTop = el.scrollHeight;
    } else if (streaming) {
      setHasNewWhileScrolled(true);
    }
  }, [messages, live?.parts, streaming]);

  // Keep pinned when layout/DOM height expands ONLY if user is at the very bottom
  useEffect(() => {
    const contentEl = contentRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!contentEl || !scrollEl) return;
    const observer = new ResizeObserver(() => {
      const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (isNearBottomRef.current && distanceFromBottom <= 20) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      } else {
        setShowScrollBottom(distanceFromBottom > 35);
      }
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, []);

  // ── prompt history ──
  const getPromptHistory = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem("klodex_prompt_history") ?? "[]");
    } catch {
      return [];
    }
  };
  const savePromptHistory = (text: string) => {
    const hist = getPromptHistory().filter((h) => h !== text);
    hist.unshift(text);
    localStorage.setItem("klodex_prompt_history", JSON.stringify(hist.slice(0, 50)));
  };

  // ── slash commands (stock) ──
  const slashCommands = useMemo<SlashCommand[]>(() => {
    const stock: Array<{ slash: string; description: string; icon?: string }> = [
      { slash: "/new", description: lang === "ru" ? "Новая сессия" : "Create a new session" },
      { slash: "/project", description: lang === "ru" ? "Выбрать папку проекта" : "Choose project folder" },
      { slash: "/stop", description: lang === "ru" ? "Прервать выполнение" : "Abort execution" },
      { slash: "/copy", description: lang === "ru" ? "Скопировать последний ответ" : "Copy last answer" },
      { slash: "/export", description: lang === "ru" ? "Экспорт в Markdown" : "Export to Markdown" },
      { slash: "/settings", description: lang === "ru" ? "Настройки" : "Open settings" },
      { slash: "/stats", description: lang === "ru" ? "Статистика токенов" : "Token statistics" },
      { slash: "/skills", description: lang === "ru" ? "Каталог скиллов" : "Skills catalog" },
      { slash: "/compact", description: lang === "ru" ? "Сжать контекст" : "Compact context" },
      { slash: "/help", description: lang === "ru" ? "Справка" : "Help" },
    ];
    return stock.map((c) => ({ ...c, name: c.slash.slice(1), isStock: true, type: "stock" } as SlashCommand));
  }, [lang]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashQuery) return slashCommands;
    const q = slashQuery.toLowerCase();
    return slashCommands.filter((c) => (c.slash || `/${c.name}`).toLowerCase().includes(q));
  }, [slashCommands, slashQuery]);

  const getSlashCommandIcon = (cmd: SlashCommand) => {
    const s = cmd.slash || `/${cmd.name}`;
    switch (s) {
      case "/new": return <Plus className="size-3.5" />;
      case "/project": case "/folder": return <FolderCode className="size-3.5" />;
      case "/stop": return <Square className="size-3.5" />;
      case "/settings": return <Settings2 className="size-3.5" />;
      case "/skills": case "/catalog": return <Sparkles className="size-3.5" />;
      default: return <span className="font-mono">/</span>;
    }
  };

  // ── engine: event loop ──
  const runEventLoop = useCallback(
    async (
      generator: AsyncGenerator<AgentEvent>,
      sessionId: string,
      targetModel: string,
    ) => {
      const agg = new ChatAggregator();
      const liveId = crypto.randomUUID();
      const startTime = Date.now();
      let streamedChars = 0;
      setLiveTps(0);

      const trackSpeed = (addedChars: number) => {
        if (addedChars <= 0) return;
        streamedChars += addedChars;
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.3) {
          const estTokens = Math.round(streamedChars / 3.8);
          setLiveTps(Math.max(1, Math.round(estTokens / elapsedSec)));
        }
      };

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
        for await (const e of generator) {
          if (e.t === "status") {
            const localizedMsg = localizeStatusMessage(e.message, lang);
            setLive((m) => (m ? { ...m, statusText: localizedMsg, stage: e.stage, retryDelayMs: e.delayMs } : m));
            setCurrentAgentAction(localizedMsg);
          } else if (e.t === "text") {
            agg.text(e.d);
            trackSpeed(e.d.length);
            setLive((m) => (m ? { ...m, parts: [...agg.parts], statusText: t("chat.streaming"), stage: "streaming" } : m));
            setCurrentAgentAction(t("chat.streaming"));
          } else if (e.t === "reason") {
            agg.reason(e.d);
            trackSpeed(e.d.length);
            setLive((m) => (m ? { ...m, parts: [...agg.parts], statusText: t("chat.thinking"), stage: "thinking" } : m));
            setCurrentAgentAction(t("chat.thinking"));
          } else if (e.t === "tool") {
            agg.startTool(e.callId, e.name, e.input);
            const inputLen = typeof e.input === "string" ? e.input.length : JSON.stringify(e.input || "").length;
            trackSpeed((e.name?.length || 0) + inputLen);
            setLive((m) => (m ? { ...m, parts: [...agg.parts], statusText: t("chat.tool", { tool: e.name }), stage: "tool" } : m));
            setCurrentAgentAction(t("chat.tool", { tool: e.name }));
          } else if (e.t === "toolres") {
            agg.finishTool(e.callId, e.name, e.output, e.isError);
            const outLen = typeof e.output === "string" ? e.output.length : JSON.stringify(e.output || "").length;
            trackSpeed(Math.min(outLen, 300));
            setLive((m) => (m ? { ...m, parts: [...agg.parts], statusText: t("chat.toolDone", { tool: e.name }), stage: "waiting" } : m));
            setCurrentAgentAction(t("chat.toolDone", { tool: e.name }));
          } else if (e.t === "swarm_start") {
            setDockTab("agents");
            setSwarmTelemetry({
              swarmId: e.swarmId,
              total: e.total,
              tasks: e.tasks.map((tItem: any) => ({
                id: tItem.id, agent: tItem.agent, model: tItem.model, prompt: tItem.prompt,
                status: "pending", action: lang === "ru" ? "Ожидание запуска…" : "Waiting to launch…",
              })),
              notes: [], messages: [], ok: 0, failed: 0,
            });
            setCurrentAgentAction(lang === "ru" ? `Координирует рой (${e.total} агентов)` : `Coordinating swarm (${e.total} agents)`);
          } else if (e.t === "swarm_update") {
            setSwarmTelemetry((prev) => prev
              ? { ...prev, tasks: prev.tasks.map((tItem) =>
                  tItem.id === e.taskId
                    ? { ...tItem, status: e.status, action: localizeSwarmAction(e.action, lang) ?? tItem.action, preview: e.preview ?? tItem.preview }
                    : tItem) }
              : prev);
          } else if (e.t === "swarm_note") {
            setSwarmTelemetry((prev) => prev
              ? { ...prev, notes: [{ author: e.author, key: e.key, time: new Date().toLocaleTimeString(lang === "ru" ? "ru" : "en-US", { minute: "2-digit", second: "2-digit" }) }, ...prev.notes] }
              : prev);
          } else if (e.t === "swarm_msg") {
            setSwarmTelemetry((prev) => prev
              ? { ...prev, messages: [{ from: e.from, to: e.to, time: new Date().toLocaleTimeString(lang === "ru" ? "ru" : "en-US", { minute: "2-digit", second: "2-digit" }) }, ...prev.messages] }
              : prev);
          } else if (e.t === "swarm_end") {
            setSwarmTelemetry((prev) => (prev ? { ...prev, ok: e.ok, failed: e.failed } : prev));
            setCurrentAgentAction(lang === "ru" ? "Рой завершил работу" : "Swarm completed");
          } else if (e.t === "finish") {
            setCurrentAgentAction(undefined);
            setMessages((m) => [...m, { id: e.messageId || liveId, role: "assistant", parts: agg.parts } as UIMessage]);
          } else if (e.t === "title") {
            setCurrentSession((prev) => (prev ? { ...prev, title: e.title } : prev));
            window.dispatchEvent(new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: sessionId, title: e.title } }));
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
            setMessages((m) => [...m, { id: liveId, role: "assistant", parts: agg.parts } as UIMessage]);
          }
        } else {
          setError(e.message);
        }
        setLive(null);
      } finally {
        setStreaming(false);
        setLiveTps(0);
        abortRef.current = null;
        setCurrentAgentAction(undefined);
        const msgs = await api.messages(sessionId).catch(() => []);
        setMessages(msgs.map((m) => m.data));
        setLive(null);
        void api.sessionTokenStats(sessionId).then(setSessionTokens).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, reloadSessions],
  );

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
    const handler = (e: Event) => setReasoningDefaultOpen((e as CustomEvent<boolean>).detail);
    const freeHandler = (e: Event) => setOnlyFree((e as CustomEvent<boolean>).detail);
    window.addEventListener("klodex:reasoningDefaultChanged", handler);
    window.addEventListener("klodex:onlyFreeChanged", freeHandler);
    return () => {
      window.removeEventListener("klodex:reasoningDefaultChanged", handler);
      window.removeEventListener("klodex:onlyFreeChanged", freeHandler);
    };
  }, []);

  // ── sessions ──
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
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
    setHasNewWhileScrolled(false);
    setTimeout(() => scrollToBottom("auto"), 60);
    try {
      const active = await api.activeChat(id);
      if (active && "active" in active && active.active) {
        abortRef.current = new AbortController();
        const activeModel = (active as { model?: string }).model || `${row.provider ?? ""}/${row.model ?? ""}`;
        const streamGen = chatStreamReconnect(id, abortRef.current.signal);
        void runEventLoop(streamGen, id, activeModel);
      }
    } catch {}
  }, [runEventLoop]);

  const newSession = useCallback(async () => {
    try {
      const dir = localStorage.getItem("klodex_project") || undefined;
      const row = await api.createSession(dir, selected?.provider, selected?.model);
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
    if (saved && !currentSession) void loadSession(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => void loadSession((e as CustomEvent<string>).detail);
    const onNew = () => void newSession().then((row) => { if (row) void reloadSessions(); });
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

  useEffect(() => {
    onCurrentSessionChange?.(currentSession?.id ?? null);
  }, [currentSession, onCurrentSessionChange]);

  useEffect(() => {
    const onDeleted = () => setCurrentSession(null);
    window.addEventListener("klodex:sessionDeleted", onDeleted);
    return () => window.removeEventListener("klodex:sessionDeleted", onDeleted);
  }, []);

  useEffect(() => { setScreenshots([]); }, [currentSession?.id]);

  // reconnect watchdog
  useEffect(() => {
    if (!currentSession || streaming) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api.activeChat(currentSession.id).then((active) => {
        if (!cancelled && "active" in active && active.active) { cancelled = true; void loadSession(currentSession.id); }
      }).catch(() => {});
    }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [currentSession?.id, streaming, loadSession]);

  // ── send ──
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
      isNearBottomRef.current = true;
      setShowScrollBottom(false);
      setHasNewWhileScrolled(false);
      setTimeout(() => scrollToBottom("smooth"), 40);

      abortRef.current = new AbortController();
      const modelStr = modelKey(selected!.provider, selected!.model);
      const streamGen = chatStream({ sessionId, message: text, model: modelStr, screenshots }, abortRef.current.signal);
      await runEventLoop(streamGen, sessionId, modelStr);
      setScreenshots([]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streaming, provider, selected, currentSession, newSession, runEventLoop, screenshots, isModelDeprecated],
  );

  // ── slash handling ──
  const handleExportMarkdown = useCallback(() => {
    if (messages.length === 0) return;
    const title = currentSession?.title || (lang === "ru" ? "Сессия Klodex" : "Klodex Session");
    let md = `# ${title}\n\n`;
    for (const m of messages) {
      md += `## ${m.role === "user" ? (lang === "ru" ? "Пользователь" : "User") : "Klodex"}\n\n`;
      for (const p of m.parts) {
        if (p.type === "text" && (p as any).text) md += `${(p as any).text}\n\n`;
        else if (p.type === "reasoning" && (p as any).text) md += `> ${(p as any).text}\n\n`;
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
  }, [messages, currentSession, lang]);

  const handleCopyLastAssistant = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant") {
        const texts = m.parts.filter((p) => p.type === "text" && typeof (p as any).text === "string").map((p) => (p as any).text).join("\n\n");
        if (texts.trim()) { void navigator.clipboard.writeText(texts.trim()); return; }
      }
    }
  }, [messages]);

  const handleShowHelp = useCallback(() => {
    const stock = lang === "ru"
      ? "`/clear` /new /project /stop /copy /export /settings /stats /skills /compact /help — локальные команды без расхода токенов. **Enter** — отправить, **Shift+Enter** — перенос строки, **/** — палитра команд."
      : "`/clear` /new /project /stop /copy /export /settings /stats /skills /compact /help — local commands, zero token usage. **Enter** — send, **Shift+Enter** — newline, **/** — command palette.";
    const helpMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text: lang === "ru" ? `### Стоковые команды\n${stock}` : `### Built-in commands\n${stock}` }],
    };
    setMessages((m) => [...m, helpMsg]);
  }, [lang]);

  const handlePickProjectDir = useCallback(async () => {
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
        const s = await api.createSession(picked, selected?.provider, selected?.model);
        void reloadSessions();
        await loadSession(s.id);
      }
    } catch (e) {
      console.error("pickFolder failed:", e);
    }
  }, [currentSession, selected, reloadSessions, loadSession, t]);

  const handleExecuteSlashCommand = useCallback(
    async (rawText: string): Promise<boolean> => {
      const match = rawText.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (!match) return false;
      const cmdName = (match[1] ?? "").toLowerCase();
      switch (cmdName) {
        case "clear":
          setMessages([]); setLive(null); setError(null); setSwarmTelemetry(null); setCurrentAgentAction(undefined);
          void newSession();
          return true;
        case "new": void newSession(); return true;
        case "project": case "folder": void handlePickProjectDir(); return true;
        case "stop": void abort(); return true;
        case "monitor": setDockTab((v) => (v === "agents" ? null : "agents")); return true;
        case "copy": handleCopyLastAssistant(); return true;
        case "export": handleExportMarkdown(); return true;
        case "settings": window.dispatchEvent(new Event("klodex:openSettings")); return true;
        case "stats": window.dispatchEvent(new CustomEvent("klodex:openSettings", { detail: { tab: "stats" } })); return true;
        case "skills": case "catalog": onOpenCatalog(); return true;
        case "help": handleShowHelp(); return true;
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
    [newSession, handlePickProjectDir, abort, handleCopyLastAssistant, handleExportMarkdown, handleShowHelp, currentSession, t, onOpenCatalog],
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
      } else if (textareaRef.current) {
        textareaRef.current.value = `${slashName} `;
        textareaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
        textareaRef.current.focus();
      }
    },
    [handleExecuteSlashCommand],
  );

  // ── key dialog ──
  const saveKey = async () => {
    if (!keyDialog) return;
    const val = keyInputVal.trim();
    if (!val) return;
    setSavingKeyDialog(true);
    setKeyDialogError(null);
    try {
      await api.saveKey(keyDialog, val);
      await onCatalogRefresh();
      const targetProv = Array.isArray(catalog) ? catalog.find((cp) => cp.id === keyDialog) : null;
      if (targetProv && targetProv.models.length > 0) {
        const firstModel = targetProv.models[0].id;
        onSelectedChange({ provider: targetProv.id, model: firstModel });
        localStorage.setItem("klodex_model", modelKey(targetProv.id, firstModel));
      }
      const pendingText = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setKeyDialog(null);
      setKeyInputVal("");
      if (pendingText) setTimeout(() => void send(pendingText), 120);
    } catch (e: any) {
      setKeyDialogError(e?.message ?? t("chat.saveKeyError"));
    } finally {
      setSavingKeyDialog(false);
    }
  };

  // ── title editing ──
  const saveEditedTitle = async () => {
    if (!currentSession) return;
    const trimmed = editingTitleVal.trim();
    setIsEditingTitle(false);
    if (trimmed && trimmed !== currentSession.title) {
      await api.updateSession(currentSession.id, { title: trimmed });
      setCurrentSession((prev) => (prev ? { ...prev, title: trimmed } : prev));
      window.dispatchEvent(new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: currentSession.id, title: trimmed } }));
      void reloadSessions();
    }
  };

  const currentProjectDir = currentSession?.project_dir || localStorage.getItem("klodex_project") || "";
  const currentProjectFolderName = currentProjectDir ? currentProjectDir.split("/").filter(Boolean).pop() || currentProjectDir : "";

  const p = provider;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* ── floating session pill (top center) ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-2.5">
        <div className="pointer-events-auto flex max-w-[min(92%,720px)] items-center gap-1 rounded-full border border-border/50 bg-card/85 py-1 pl-3 pr-1.5 shadow-lg backdrop-blur-xl">
          {isEditingTitle ? (
            <input
              autoFocus
              type="text"
              value={editingTitleVal}
              onChange={(e) => setEditingTitleVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void saveEditedTitle(); }
                else if (e.key === "Escape") setIsEditingTitle(false);
              }}
              onBlur={() => void saveEditedTitle()}
              className="h-6 w-56 rounded-md border border-input bg-background px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <button
              className="max-w-[220px] cursor-pointer truncate text-xs font-semibold text-foreground/90 hover:text-foreground"
              onClick={() => {
                if (!currentSession) return;
                setEditingTitleVal(currentSession.title ?? "");
                setIsEditingTitle(true);
              }}
              title={t("chat.clickToEditTitle")}
            >
              {currentSession?.title ?? t("chat.newSession")}
            </button>
          )}
          {currentProjectDir && (
            <>
              <span className="h-3 w-px shrink-0 bg-border/70" />
              <span className="max-w-[160px] truncate font-mono text-[10px] text-muted-foreground" title={currentProjectDir}>
                {currentProjectFolderName}
              </span>
            </>
          )}
          <span className="h-3 w-px shrink-0 bg-border/70" />
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!currentSession}
            onClick={() => setDockTab((v) => (v === "workspace" ? null : "workspace"))}
            className={cn("size-6 cursor-pointer rounded-full text-muted-foreground hover:text-foreground", dockTab === "workspace" && "bg-primary/15 text-primary hover:text-primary")}
            title={lang === "ru" ? "Рабочая область" : "Workspace"}
          >
            <FolderCode className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setDockTab((v) => (v === "agents" ? null : "agents"))}
            className={cn("size-6 cursor-pointer rounded-full text-muted-foreground hover:text-foreground", dockTab === "agents" && "bg-primary/15 text-primary hover:text-primary")}
            title={dockTab === "agents" ? t("chat.agentsHide") : t("chat.agentsMonitor")}
          >
            <Cpu className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="size-6 cursor-pointer rounded-full text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => void newSession()} className="cursor-pointer gap-2 text-xs">
                <Plus className="size-3.5" /> {t("chat.newSession")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCatalogRefresh} className="cursor-pointer gap-2 text-xs">
                <RotateCcw className="size-3.5" /> {t("chat.refreshCatalogTooltip")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!currentSession}
                onClick={async () => {
                  if (!currentSession) return;
                  if (!confirm(t("chat.deleteSessionConfirm"))) return;
                  await api.deleteSession(currentSession.id);
                  localStorage.removeItem("klodex_active_session_id");
                  setCurrentSession(null);
                  setMessages([]);
                  setSessionTokens(null);
                  setLive(null);
                  void reloadSessions();
                }}
                className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" /> {t("chat.deleteSessionTooltip")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── chat column ── */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onWheel={handleWheel}
            className="studio-scroll chat-scroll h-full"
          >
            <div ref={contentRef} className="mx-auto flex max-w-3xl flex-col px-4 sm:px-14 pb-6 pt-16">
              {messages.length === 0 && !live && (
                <ChatEmptyState
                  providerName={p?.name}
                  modelName={selected?.model}
                  projectDir={currentProjectDir}
                  onSelectPrompt={(text) => void send(text)}
                  onOpenSettings={() => window.dispatchEvent(new Event("klodex:openSettings"))}
                  onPickProjectDir={handlePickProjectDir}
                />
              )}
              {messages.map((m) => {
                if (isCompactionMessage(m)) {
                  return <SystemCompactionMessage key={m.id} message={m} lang={lang} />;
                }
                return (
                  <div key={m.id} className="mb-7 last:mb-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out">
                    {m.role === "user" ? (
                      <UserMessageBubble message={m} lang={lang} />
                    ) : (
                      <StudioAssistantMessage
                        msg={{
                          id: m.id,
                          role: "assistant",
                          parts: m.parts as any,
                          model: (m as any).model,
                          usage: (m as any).usage,
                          pending: false,
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {live && <StudioAssistantMessage msg={live} />}
            </div>
          </div>

          {/* Floating scroll to bottom button */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              className="group absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-xl backdrop-blur-md transition-all hover:bg-accent hover:border-border hover:scale-105 active:scale-95 animate-in fade-in zoom-in-95 duration-150 cursor-pointer"
              title={lang === "ru" ? "Прокрутить в конец" : "Scroll to bottom"}
            >
              <ArrowDown className="size-3.5 text-primary transition-transform group-hover:translate-y-0.5" />
              <span>{lang === "ru" ? "Вниз" : "Bottom"}</span>
              {hasNewWhileScrolled && (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              )}
            </button>
          )}
        </div>

        {/* error / notices */}
        {error && (
          <div className="mx-auto mb-2 w-full max-w-3xl shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive animate-in fade-in duration-200">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
          </div>
        )}
        {compactNotice && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary animate-in fade-in duration-200">
            <span className="flex items-center gap-2 font-mono">
              <Archive className="size-3.5 shrink-0" />
              <span className="truncate">{compactNotice}</span>
            </span>
            <Button variant="ghost" size="icon-xs" className="cursor-pointer" onClick={() => setCompactNotice(null)}>
              <X className="size-3" />
            </Button>
          </div>
        )}
        {isModelDeprecated && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>{t("chat.modelDownBanner", { model: selected?.model || "" })}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 shrink-0 cursor-pointer border-destructive/30 text-[11px] text-destructive hover:bg-destructive/20"
              onClick={() => {
                onSelectedChange({ provider: "opencode", model: "deepseek-v4.1-flash-free" });
                localStorage.setItem("klodex_model", "opencode/deepseek-v4.1-flash-free");
              }}
            >
              {t("chat.switchDeepSeek")}
            </Button>
          </div>
        )}

        {/* ── floating composer ── */}
        <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 sm:px-14 pb-5 pt-2">
          {/* slash palette */}
          {slashMenuOpen && filteredSlashCommands.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 z-50 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-md chat-scroll">
              <div className="flex select-none items-center justify-between border-b border-border/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                <span>{t("chat.commandsAndPrompts", { count: filteredSlashCommands.length })}</span>
                <span className="text-[10px] opacity-75">{t("chat.commandsHint")}</span>
              </div>
              <div className="space-y-0.5 py-1">
                {filteredSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.slash || cmd.name}
                    type="button"
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSlashSelectedIndex(idx)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors",
                      idx === slashSelectedIndex ? "bg-accent text-accent-foreground font-medium" : "text-foreground/90 hover:bg-accent/50",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {getSlashCommandIcon(cmd)}
                      <span className="font-mono font-semibold text-primary">{cmd.slash || `/${cmd.name}`}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{cmd.description || cmd.name}</span>
                    </span>
                    <Badge variant="secondary" className="h-4 px-1.5 py-0 font-mono text-[9px]">
                      {t("chat.actionBadge")}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          <PromptInput
            className="klodex-composer"
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
            {screenshots.length > 0 && (
              <div className="flex gap-2 p-2">
                {screenshots.map((id) => (
                  <button key={id} type="button" className="relative" title={lang === "ru" ? "Убрать снимок" : "Remove screenshot"} onClick={() => setScreenshots((items) => items.filter((item) => item !== id))}>
                    <img src={`/api/screenshots/${id}`} alt="Attached screenshot" className="h-16 w-24 rounded-lg border border-border object-cover" />
                    <span className="absolute right-0 top-0 rounded-bl bg-background px-1">×</span>
                  </button>
                ))}
              </div>
            )}
            <PromptInputTextarea
              ref={textareaRef}
              placeholder={isModelDeprecated ? t("chat.inputPlaceholderModelDown") : t("chat.inputPlaceholder")}
              disabled={isModelDeprecated}
              onChange={(ev) => {
                const val = ev.target.value;
                if (val.startsWith("/")) {
                  const parts = val.slice(1).split(/\s+/);
                  if (parts.length > 1) setSlashMenuOpen(false);
                  else { setSlashQuery(parts[0] || ""); setSlashMenuOpen(true); setSlashSelectedIndex(0); }
                } else if (slashMenuOpen) {
                  setSlashMenuOpen(false);
                }
              }}
              onKeyDown={(ev) => {
                if (slashMenuOpen && filteredSlashCommands.length > 0) {
                  if (ev.key === "ArrowDown") { ev.preventDefault(); setSlashSelectedIndex((prev) => (prev + 1) % filteredSlashCommands.length); return; }
                  if (ev.key === "ArrowUp") { ev.preventDefault(); setSlashSelectedIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length); return; }
                  if (ev.key === "Tab" || (ev.key === "Enter" && !ev.shiftKey)) {
                    ev.preventDefault();
                    const selectedCmd = filteredSlashCommands[slashSelectedIndex];
                    if (selectedCmd) selectCommand(selectedCmd);
                    return;
                  }
                  if (ev.key === "Escape") { ev.preventDefault(); setSlashMenuOpen(false); return; }
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
            <PromptInputFooter className="flex items-center justify-between gap-1.5 py-1.5 px-2 min-w-0">
              <PromptInputTools className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePickProjectDir}
                  disabled={streaming}
                  className="h-7 max-w-[130px] shrink-0 cursor-pointer gap-1.5 rounded-full px-2.5 font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  title={currentProjectDir ? t("chat.projectFolderTooltip", { dir: currentProjectDir }) : t("chat.pickProjectFolderDialog")}
                >
                  <FolderCode className="size-3.5 shrink-0" />
                  <span className="truncate">{currentProjectFolderName || (lang === "ru" ? "папка" : "folder")}</span>
                </Button>
                {streaming ? (
                  <div className="flex min-w-0 items-center gap-2 shrink-0">
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                      {currentAgentAction || t("chat.agentWorking")}
                    </span>
                    {liveTps > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-400 animate-in fade-in duration-150">
                        <Zap className="size-2.5" />
                        {liveTps} t/s
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5 shrink-0">
                    <ModelPickerPopover
                      catalog={catalog}
                      selected={selected}
                      onSelectedChange={onSelectedChange}
                      onOpenSettings={onOpenSettings}
                      onKeyNeeded={(pId) => setKeyDialog(pId)}
                      disabled={streaming}
                    />
                    {selected?.provider === "tagflow" && (
                      <AdcodeQuickWidget
                        onOpenFullSettings={() => setKeyDialog("tagflow")}
                        lang={lang}
                      />
                    )}
                    <ContextTelemetryBadge
                      usedTokens={usedTokens}
                      contextWindow={contextWindow}
                      percentFree={percentFree}
                      sessionTokens={sessionTokens}
                      onCompact={() => void send("/compact")}
                      disabled={streaming || !currentSession}
                      lang={lang}
                    />
                  </div>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                className="shrink-0 z-10 ml-1.5"
                status={streaming ? "streaming" : "ready"}
                onStop={abort}
                disabled={isModelDeprecated}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      {/* ── unified right dock: workspace & agents share one slot ── */}
      {dockTab && currentSession && (
        <aside className="flex h-full min-h-0 w-[clamp(380px,34vw,560px)] shrink-0 flex-col overflow-hidden border-l border-border/50 bg-card/50 backdrop-blur-xl animate-in slide-in-from-right-2 fade-in duration-200">
          <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setDockTab("workspace")}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                dockTab === "workspace" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FolderCode className="size-3.5" />
              {lang === "ru" ? "Рабочая область" : "Workspace"}
            </button>
            <button
              type="button"
              onClick={() => setDockTab("agents")}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                dockTab === "agents" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Cpu className="size-3.5" />
              {t("chat.agents")}
              {swarmTelemetry?.tasks.some((task) => task.status === "running") && (
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setDockTab(null)}
              className="size-6 cursor-pointer text-muted-foreground hover:text-foreground"
              title={t("common.close")}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1">
            {dockTab === "workspace" ? (
              <WorkspacePanel
                key={currentSession.id}
                embedded
                sessionId={currentSession.id}
                model={selected ? modelKey(selected.provider, selected.model) : ""}
                onClose={() => setDockTab(null)}
                onAttach={(id) => setScreenshots((items) => [...new Set([...items, id])].slice(-4))}
                onRun={() => { setTimeout(() => { void loadSession(currentSession.id); }, 1500); }}
              />
            ) : (
              <AgentMonitorPanel
                embedded
                open
                onClose={() => setDockTab(null)}
                mainAgent={{
                  model: selected?.model || t("chat.modelNotSelected"),
                  status: streaming ? "running" : error ? "error" : "idle",
                  currentAction: currentAgentAction,
                  stage: live?.stage,
                  elapsedMs: live?.startedAt ? Date.now() - live.startedAt : undefined,
                }}
                swarm={swarmTelemetry}
              />
            )}
          </div>
        </aside>
      )}

      {/* ── key dialog ── */}
      <Dialog open={!!keyDialog} onOpenChange={(o) => !o && (pendingMessageRef.current = null) === null && setKeyDialog(null)}>
        <DialogContent className="sm:max-w-[440px] p-6 gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {lang === "ru" ? "API-ключ провайдера" : "Provider API key"}
            </DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            value={keyInputVal}
            onChange={(e) => setKeyInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveKey(); }}
            placeholder="sk-..."
            className="font-mono text-xs"
          />
          {keyDialogError && <div className="text-xs text-destructive">{keyDialogError}</div>}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setKeyDialog(null)} className="cursor-pointer">
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void saveKey()} disabled={savingKeyDialog || !keyInputVal.trim()} className="cursor-pointer">
              {savingKeyDialog ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
