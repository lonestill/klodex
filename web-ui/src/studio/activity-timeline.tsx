/* ── Studio activity timeline ────────────────────────────────────────────────
   Replaces the wall of "Thinking" pills + "Agent actions" cards with a single
   collapsible timeline block: consecutive tool calls and reasoning steps are
   aggregated into one summary row ("Agent actions (6) · 2 thoughts · chips"),
   expandable into a vertical dot-rail timeline. Text parts stay as prose.   */

import { useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Coins,
  Loader2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  CompactToolRow,
  getToolMeta,
  type ToolPart,
} from "@/components/klodex/agent-tools";
import type { ChatPart, LiveMessage } from "@/lib/chat-aggregator";

/* ---------- grouping ---------- */

type TimelineEntry =
  | { kind: "tool"; part: ToolPart }
  | { kind: "thought"; text: string; id?: string };

type TimelineBlock =
  | { kind: "text"; text: string; id?: string; isLast: boolean; key: string }
  | { kind: "activity"; entries: TimelineEntry[]; key: string };

function groupTimeline(parts: ChatPart[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  let activity: TimelineEntry[] = [];

  const flush = () => {
    if (activity.length > 0) {
      blocks.push({
        kind: "activity",
        entries: activity,
        key: `act-${blocks.length}`,
      });
      activity = [];
    }
  };

  parts.forEach((part, i) => {
    const type = part.type as string;
    if (type === "reasoning") {
      activity.push({
        kind: "thought",
        text: (part as { text?: string }).text ?? "",
        id: (part as { id?: string }).id,
      });
      return;
    }
    if (typeof type === "string" && (type.startsWith("tool-") || "toolCallId" in part)) {
      activity.push({ kind: "tool", part: part as unknown as ToolPart });
      return;
    }
    if (type === "text") {
      flush();
      const isLast =
        i === parts.length - 1 || parts.slice(i + 1).every((p) => p.type !== "text");
      blocks.push({
        kind: "text",
        text: (part as { text?: string }).text ?? "",
        id: (part as { id?: string }).id,
        isLast,
        key: `txt-${blocks.length}`,
      });
      return;
    }
    // unknown part types are ignored
  });
  flush();
  return blocks;
}

/* ---------- one collapsible activity block ---------- */

function ActivityBlock({ entries }: { entries: TimelineEntry[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const tools = entries.filter(
    (e): e is Extract<TimelineEntry, { kind: "tool" }> => e.kind === "tool",
  );
  const thoughts = entries.filter(
    (e): e is Extract<TimelineEntry, { kind: "thought" }> => e.kind === "thought",
  );

  const isRunning = tools.some(
    (p) => p.part.state === "input-available" || p.part.state === "input-streaming",
  );
  const hasError = tools.some(
    (p) => p.part.state === "output-error" || !!p.part.errorText,
  );

  /* compact chips: group consecutive same-tool entries */
  const chips = useMemo(() => {
    const out: {
      name: string;
      icon: React.ComponentType<{ className?: string }>;
      color: string;
      count: number;
    }[] = [];
    for (const e of tools) {
      const toolType = e.part.type as string;
      const toolName = toolType.startsWith("tool-") ? toolType.slice(5) : toolType;
      const meta = getToolMeta(toolName, e.part.input);
      const last = out[out.length - 1];
      if (last && last.name === meta.name) {
        last.count += 1;
      } else {
        out.push({ name: meta.name, icon: meta.icon, color: meta.color, count: 1 });
      }
    }
    return out;
  }, [tools]);

  const thoughtChars = useMemo(() => {
    return thoughts.reduce((acc, th) => acc + (th.text?.length || 0), 0);
  }, [thoughts]);
  const thoughtTokens = Math.round(thoughtChars / 3.8);

  const status = isRunning
    ? { icon: Loader2, cls: "animate-spin text-primary" }
    : hasError
      ? { icon: TriangleAlert, cls: "text-amber-500" }
      : { icon: Check, cls: "text-emerald-500" };
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors duration-150",
        open
          ? "border-border/60 bg-card/40"
          : "border-border/40 bg-card/20 hover:border-border/60 hover:bg-card/40",
        isRunning && "border-primary/30 bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-left"
      >
        <StatusIcon className={cn("size-3.5 shrink-0", status.cls)} />
        <span className="shrink-0 text-xs font-medium text-foreground/85">
          {t("tools.agentActions", { count: tools.length })}
        </span>
        {thoughts.length > 0 && (
          <span className="shrink-0 font-display text-xs italic text-muted-foreground">
            · {t("tools.thoughts", { count: thoughts.length })}
            {thoughtTokens > 0 && ` (${thoughtTokens.toLocaleString()} tok)`}
          </span>
        )}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {chips.slice(0, 4).map((c, i) => (
            <span
              key={`${c.name}-${i}`}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              <c.icon className={cn("size-3", c.color)} />
              {c.name}
              {c.count > 1 && <span className="opacity-60">×{c.count}</span>}
            </span>
          ))}
          {chips.length > 4 && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
              +{chips.length - 4}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 px-3.5 pb-3 pt-3">
          <div className="flex flex-col">
            {entries.map((e, i) => {
              const isLastEntry = i === entries.length - 1;
              if (e.kind === "tool") {
                const isRunning = e.part.state === "input-available" || e.part.state === "input-streaming";
                const isError = e.part.state === "output-error" || !!e.part.errorText;
                return (
                  <div key={e.part.toolCallId ?? i} className="relative pl-8 pb-2">
                    {/* continuous unified spine */}
                    {entries.length > 1 && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-3.5 -translate-x-1/2 w-px bg-border/60",
                          i === 0 ? "top-3.5" : "top-0",
                          isLastEntry ? "bottom-[calc(100%-14px)]" : "bottom-0",
                        )}
                      />
                    )}
                    {/* timeline tree dot centered strictly on the spine */}
                    <span
                      className={cn(
                        "absolute left-3.5 top-3.5 -translate-x-1/2 -translate-y-1/2 size-2 rounded-full border z-10 transition-colors bg-background",
                        isRunning
                          ? "border-primary bg-primary animate-pulse"
                          : isError
                            ? "border-destructive bg-destructive/80"
                            : "border-border/80 bg-muted-foreground/40",
                      )}
                    />
                    <div>
                      <div className="overflow-hidden rounded-lg border border-border/50 bg-background/40">
                        <CompactToolRow part={e.part} />
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={e.id ?? i} className="relative pl-8 pb-2">
                  {/* continuous unified spine */}
                  {entries.length > 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-3.5 -translate-x-1/2 w-px bg-border/60",
                        i === 0 ? "top-3.5" : "top-0",
                        isLastEntry ? "bottom-[calc(100%-14px)]" : "bottom-0",
                      )}
                    />
                  )}
                  {/* thought node badge centered strictly on the spine */}
                  <span className="absolute left-3.5 top-3.5 -translate-x-1/2 -translate-y-1/2 z-10 flex size-5 items-center justify-center rounded-full border border-primary/25 bg-background shadow-xs">
                    <span className="absolute inset-0 rounded-full bg-primary/10" />
                    <Brain className="relative z-10 size-3 text-primary" />
                  </span>
                  <div
                    className="max-h-40 overflow-y-auto font-display text-sm italic leading-relaxed text-muted-foreground pt-1"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {e.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- full assistant message ---------- */

export function StudioAssistantMessage({ msg }: { msg: LiveMessage }) {
  const { t, lang } = useI18n();
  const blocks = useMemo(() => groupTimeline(msg.parts), [msg.parts]);
  const usage = (msg as { usage?: { totalTokens?: number; durationMs?: number } }).usage;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {blocks.map((b) => {
        if (b.kind === "text") {
          return (
            <div
              key={b.key}
              className={cn(
                "min-w-0 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                b.isLast && msg.pending && "after:animate-pulse after:text-primary after:content-['▍']",
              )}
            >
              <Streamdown>{b.text}</Streamdown>
            </div>
          );
        }
        return <ActivityBlock key={b.key} entries={b.entries} />;
      })}

      {msg.pending && (!msg.parts.length || msg.stage === "retry" || msg.stage === "compacting") && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span className="font-display italic">{t("tools.working")}</span>
        </div>
      )}

      {(() => {
        const showTelemetry = typeof localStorage !== "undefined"
          ? localStorage.getItem("klodex_show_telemetry") !== "false"
          : true;
        if (!showTelemetry || !usage) return null;

        const durationSec = (usage.durationMs ?? 0) / 1000;
        const rawOutTok = Number((usage as any).completionTokens) || 0;
        const inTok = Number((usage as any).promptTokens) || 0;
        // If upstream didn't report completion tokens, calculate from actual output text chars
        const textChars = (msg.parts || []).reduce((acc, p) => acc + (p.type === "text" && p.text ? p.text.length : 0), 0);
        const estOutTok = Math.round(textChars / 3.8);
        const outTok = rawOutTok > 0 ? rawOutTok : estOutTok;
        const totalTok = usage.totalTokens && usage.totalTokens > 0
          ? usage.totalTokens
          : (inTok + outTok);

        return (
          <div
            className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10.5px] text-muted-foreground/75 select-none"
            title={
              lang === "ru"
                ? `Всего: ${totalTok.toLocaleString()} токенов (вход: ${inTok.toLocaleString()}, выход: ${outTok.toLocaleString()})`
                : `Total: ${totalTok.toLocaleString()} tokens (in: ${inTok.toLocaleString()}, out: ${outTok.toLocaleString()})`
            }
          >
            <span className="inline-flex items-center gap-1 text-muted-foreground/90">
              <Coins className="size-3 text-muted-foreground/70" />
              <span>{totalTok.toLocaleString()} tok</span>
            </span>

            {durationSec > 0 && (
              <span className="text-muted-foreground/60">
                · {durationSec.toFixed(1)}{lang === "ru" ? "с" : "s"}
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}
