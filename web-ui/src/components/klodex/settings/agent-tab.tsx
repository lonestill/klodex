import { useMemo } from "react";
import { RotateCcw, Sliders, Terminal, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { KlodexProvider } from "@/lib/api";

interface AgentTabProps {
  catalog: KlodexProvider[];
  maxSteps: number;
  setMaxSteps: (n: number) => void;
  maxSubagentSteps: number;
  setMaxSubagentSteps: (n: number) => void;
  reasoningOpen: boolean;
  setReasoningOpen: (v: boolean) => void;
  subagentExplore: string;
  setSubagentExplore: (v: string) => void;
  subagentCoder: string;
  setSubagentCoder: (v: string) => void;
  subagentTester: string;
  setSubagentTester: (v: string) => void;
  subagentGeneral: string;
  setSubagentGeneral: (v: string) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
}

export function AgentTab({
  catalog,
  maxSteps,
  setMaxSteps,
  maxSubagentSteps,
  setMaxSubagentSteps,
  reasoningOpen,
  setReasoningOpen,
  subagentExplore,
  setSubagentExplore,
  subagentCoder,
  setSubagentCoder,
  subagentTester,
  setSubagentTester,
  subagentGeneral,
  setSubagentGeneral,
  systemPrompt,
  setSystemPrompt,
}: AgentTabProps) {
  const { t, lang } = useI18n();

  const availableSubagentModels = useMemo(() => {
    const list: Array<{ id: string; name: string; providerName: string }> = [];
    for (const p of catalog) {
      const isReady = p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local";
      if (!isReady) continue;
      for (const m of p.models) {
        list.push({
          id: `${p.id}/${m.id}`,
          name: m.name || m.id,
          providerName: p.name,
        });
      }
    }
    return list;
  }, [catalog]);

  return (
    <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      {/* 1. Agent Behavior */}
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Sliders className="size-3.5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {t("settings.agentBehavior")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "ru" ? "Глубина планирования и отображение рассуждений" : "Execution depth limits and thought chain presentation"}
            </p>
          </div>
        </div>

        {/* Max steps */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-foreground">{t("settings.maxStepsTitle")}</div>
            <div className="text-[11px] text-muted-foreground">{t("settings.maxStepsSubtitle")}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
              {[32, 64, 128].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMaxSteps(s)}
                  className={cn(
                    "cursor-pointer rounded px-2.5 py-1 font-mono text-[11px] transition-colors",
                    maxSteps === s
                      ? "bg-primary font-semibold text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={256}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Math.max(1, Math.min(256, Number(e.target.value) || 64)))}
              className="h-7.5 w-14 text-center font-mono text-xs"
            />
          </div>
        </div>

        {/* Reasoning visibility */}
        <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-3">
          <div>
            <div className="text-xs font-medium text-foreground">{t("settings.reasoningTitle")}</div>
            <div className="text-[11px] text-muted-foreground">{t("settings.reasoningSubtitle")}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setReasoningOpen(true)}
              className={cn(
                "cursor-pointer rounded px-3 py-1 text-xs transition-all",
                reasoningOpen
                  ? "border border-border/80 bg-background font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("settings.expanded")}
            </button>
            <button
              type="button"
              onClick={() => setReasoningOpen(false)}
              className={cn(
                "cursor-pointer rounded px-3 py-1 text-xs transition-all",
                !reasoningOpen
                  ? "border border-border/80 bg-background font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("settings.collapsed")}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Subagents & Swarm */}
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-400">
            <Workflow className="size-3.5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {t("settings.subagentsTitle")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "ru" ? "Параллельные воркеры и специализация ролей" : "Autonomous delegated workers and specialized roles"}
            </p>
          </div>
        </div>

        {/* Subagent steps */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-foreground">{t("settings.subagentStepsTitle")}</div>
            <div className="text-[11px] text-muted-foreground">{t("settings.subagentStepsSubtitle")}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
              {[16, 32, 64].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMaxSubagentSteps(s)}
                  className={cn(
                    "cursor-pointer rounded px-2.5 py-1 font-mono text-[11px] transition-colors",
                    maxSubagentSteps === s
                      ? "bg-primary font-semibold text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={128}
              value={maxSubagentSteps}
              onChange={(e) => setMaxSubagentSteps(Math.max(1, Math.min(128, Number(e.target.value) || 32)))}
              className="h-7.5 w-14 text-center font-mono text-xs"
            />
          </div>
        </div>

        {/* Subagent Roles */}
        <div className="space-y-2 border-t border-border/40 pt-3">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">
            {t("settings.subagentRoleModels")}
          </div>
          {[
            {
              role: "explore",
              name: "Explore",
              desc: t("settings.subagentExploreDesc"),
              val: subagentExplore,
              setVal: setSubagentExplore,
            },
            {
              role: "coder",
              name: "Coder",
              desc: t("settings.subagentCoderDesc"),
              val: subagentCoder,
              setVal: setSubagentCoder,
            },
            {
              role: "tester",
              name: "Tester",
              desc: t("settings.subagentTesterDesc"),
              val: subagentTester,
              setVal: setSubagentTester,
            },
            {
              role: "general",
              name: "General",
              desc: t("settings.subagentGeneralDesc"),
              val: subagentGeneral,
              setVal: setSubagentGeneral,
            },
          ].map((item) => (
            <div
              key={item.role}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/50 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <span className="text-xs font-semibold text-foreground">{item.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">({item.desc})</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Select
                  value={item.val || "__default__"}
                  onValueChange={(v) => item.setVal(v === "__default__" ? "" : v)}
                >
                  <SelectTrigger className="h-8 min-w-[200px] max-w-[280px] bg-background/80 font-mono text-xs">
                    <SelectValue placeholder={t("settings.subagentInherit")} />
                  </SelectTrigger>
                  <SelectContent align="end" className="chat-scroll max-h-[300px] text-xs">
                    <SelectItem value="__default__" className="text-xs text-muted-foreground">
                      {t("settings.subagentInherit")}
                    </SelectItem>
                    {availableSubagentModels.map((m) => (
                      <SelectItem key={`${item.role}-${m.id}`} value={m.id} className="font-mono text-xs">
                        <span className="truncate">{m.providerName} / {m.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {item.val && (
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => item.setVal("")}
                    className="size-7.5 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={t("settings.resetToDefault")}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. System Instructions */}
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <Terminal className="size-3.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
                {t("settings.systemInstructions")}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {lang === "ru" ? "Глобальный промпт перед началом работы агента" : "Global prepended instructions across all agent sessions"}
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {systemPrompt.length} {lang === "ru" ? "симв." : "chars"}
          </span>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("settings.presets")}:</span>
          <button
            type="button"
            onClick={() =>
              setSystemPrompt(
                lang === "ru"
                  ? "Пиши только чистый рабочий код без лишних пояснений, воды и вежливых вступлений. Не меняй форматирование нетронутых строк. Не добавляй комментарии 'добавьте код сюда'."
                  : "Write clean, production-ready code with no conversational filler or apologies. Preserve formatting on untouched lines. Never add placeholders.",
              )
            }
            className="cursor-pointer rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {t("settings.presetConcise")}
          </button>
          <button
            type="button"
            onClick={() =>
              setSystemPrompt(
                lang === "ru"
                  ? "Анализируй архитектурные риски перед написанием кода. Указывай на скрытые грабли, избегай оверинжиниринга. Предлагай самые надежные и минимальные решения."
                  : "Analyze architectural risks before writing code. Flag hidden edge cases, prevent overengineering. Recommend robust, minimal implementations.",
              )
            }
            className="cursor-pointer rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {t("settings.presetArchitect")}
          </button>
          <button
            type="button"
            onClick={() =>
              setSystemPrompt(
                lang === "ru"
                  ? "Перед любыми правками тщательно исследуй кодовую базу, проверяй типы и зависимости. Убедись в обратной совместимости."
                  : "Thoroughly inspect codebase before edits, verifying strict types and dependencies. Ensure backwards compatibility.",
              )
            }
            className="cursor-pointer rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {t("settings.presetAudit")}
          </button>
          {systemPrompt && (
            <button
              type="button"
              onClick={() => setSystemPrompt("")}
              className="cursor-pointer rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
            >
              {t("settings.clear")}
            </button>
          )}
        </div>

        <Textarea
          rows={5}
          placeholder={t("settings.systemPromptPlaceholder")}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="resize-y bg-background/80 font-mono text-xs leading-relaxed"
        />
      </div>

      <div className="py-2 text-center font-mono text-[11px] text-muted-foreground/80">
        {t("settings.saveShortcut")}
      </div>
    </div>
  );
}
