import {
  Clock,
  Coins,
  Database,
  Loader2,
  Minimize2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import type { FullTokenStatsReport } from "@/lib/api";
import { formatTokensNumber } from "./types";

interface StatsTabProps {
  tokenStats: FullTokenStatsReport | null;
  loadingStats: boolean;
}

export function StatsTab({ tokenStats, loadingStats }: StatsTabProps) {
  const { t, lang } = useI18n();

  if (loadingStats && !tokenStats) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="font-display italic text-sm">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      {/* Top KPI Cards (5 columns) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Tokens */}
        <div className="space-y-1.5 rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">{t("stats.totalTokens")}</span>
            <Coins className="size-3.5 text-primary" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-foreground">
            {formatTokensNumber(tokenStats?.total?.totalTokens ?? 0)}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {t("stats.inputOutput", {
              prompt: formatTokensNumber(tokenStats?.total?.promptTokens ?? 0),
              completion: formatTokensNumber(tokenStats?.total?.completionTokens ?? 0),
            })}
          </div>
        </div>

        {/* Card 2: Today */}
        <div className="space-y-1.5 rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">{t("stats.today")}</span>
            <Clock className="size-3.5 text-emerald-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-foreground">
            {formatTokensNumber(tokenStats?.today?.totalTokens ?? 0)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {t("stats.callsCount", { count: tokenStats?.today?.requests ?? 0 })}
          </div>
        </div>

        {/* Card 3: Week */}
        <div className="space-y-1.5 rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">{t("stats.week")}</span>
            <TrendingUp className="size-3.5 text-sky-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-foreground">
            {formatTokensNumber(tokenStats?.thisWeek?.totalTokens ?? 0)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {t("stats.callsCount", { count: tokenStats?.thisWeek?.requests ?? 0 })}
          </div>
        </div>

        {/* Card 4: Requests & Average */}
        <div className="space-y-1.5 rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium">{t("stats.totalCalls")}</span>
            <Database className="size-3.5 text-violet-400" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-foreground">
            {tokenStats?.total?.requests ?? 0}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            ~{formatTokensNumber(Math.round((tokenStats?.total?.totalTokens ?? 0) / Math.max(1, tokenStats?.total?.requests ?? 1)))} / {lang === "ru" ? "вызов" : "call"}
          </div>
        </div>

        {/* Card 5: Compact Saved Tokens */}
        <div className="col-span-2 sm:col-span-1 space-y-1.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-medium text-amber-500/90">{t("stats.compactSaved")}</span>
            <Minimize2 className="size-3.5 text-amber-500" />
          </div>
          <div className="font-mono text-xl font-bold tracking-tight text-foreground">
            {formatTokensNumber(tokenStats?.compact?.tokensPruned ?? 0)}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {t("stats.compactSub", {
              msgs: tokenStats?.compact?.droppedMessages ?? 0,
              compactions: tokenStats?.compact?.compactions ?? 0,
            })}
          </div>
        </div>
      </div>

      {/* Middle Grid: Providers Distribution & Top Models */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Providers Breakdown */}
        <div className="space-y-3.5 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold tracking-tight text-foreground">{t("stats.byProvider")}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("stats.activeProviders", { count: tokenStats?.byProvider?.length ?? 0 })}
            </span>
          </div>

          {!tokenStats?.byProvider || tokenStats.byProvider.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t("stats.noData")}
            </div>
          ) : (
            <div className="chat-scroll max-h-[190px] space-y-3 overflow-y-auto pr-1">
              {tokenStats.byProvider.map((p) => (
                <div key={p.provider} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground truncate">{p.provider}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTokensNumber(p.totalTokens)} ({p.percentage}%)
                    </span>
                  </div>
                  <Progress value={p.percentage} className="h-1.5" />
                  <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground/75">
                    <span>
                      {t("stats.inputOutput", {
                        prompt: formatTokensNumber(p.promptTokens),
                        completion: formatTokensNumber(p.completionTokens),
                      })}
                    </span>
                    <span>{t("stats.callsCount", { count: p.requests })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Models Breakdown */}
        <div className="space-y-3.5 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-semibold tracking-tight text-foreground">{t("stats.byModel")}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {t("stats.modelsCount", { count: tokenStats?.byModel?.length ?? 0 })}
            </span>
          </div>

          {!tokenStats?.byModel || tokenStats.byModel.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t("stats.noData")}
            </div>
          ) : (
            <div className="chat-scroll max-h-[190px] space-y-2 overflow-y-auto pr-1">
              {tokenStats.byModel.slice(0, 8).map((m) => (
                <div
                  key={`${m.provider}/${m.model}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-background/50 p-2.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="h-4.5 shrink-0 px-1.5 font-mono text-[9px]">
                      {m.provider}
                    </Badge>
                    <span className="truncate font-mono text-[11px] text-foreground" title={m.model}>
                      {m.model}
                    </span>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px]">
                    <span className="font-semibold text-foreground">{formatTokensNumber(m.totalTokens)}</span>
                    <span className="ml-1.5 text-[10px] text-muted-foreground">({t("stats.callsCount", { count: m.requests })})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Recent Calls Log */}
      <div className="space-y-3.5 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold tracking-tight text-foreground">{t("stats.recent")}</span>
            <Badge variant="secondary" className="h-4.5 px-1.5 font-mono text-[10px]">
              {t("stats.recordsCount", { count: tokenStats?.recent?.length ?? 0 })}
            </Badge>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("stats.sqliteDb")}
          </span>
        </div>

        {!tokenStats?.recent || tokenStats.recent.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            {t("stats.logEmpty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="chat-scroll max-h-[220px] overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted/60 font-mono text-[10px] text-muted-foreground uppercase tracking-wider backdrop-blur-xs">
                  <tr>
                    <th className="px-3.5 py-2.5">{t("stats.colTime")}</th>
                    <th className="px-3.5 py-2.5">{t("stats.colModel")}</th>
                    <th className="px-3.5 py-2.5 text-right">{t("stats.colPrompt")}</th>
                    <th className="px-3.5 py-2.5 text-right">{t("stats.colCompletion")}</th>
                    <th className="px-3.5 py-2.5 text-right">{t("stats.colTotal")}</th>
                    <th className="px-3.5 py-2.5 text-right">{t("stats.colDuration")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                  {tokenStats.recent.map((rec) => (
                    <tr key={rec.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3.5 py-2 text-[10px] text-muted-foreground">
                        {new Date(rec.createdAt).toLocaleTimeString(lang === "ru" ? "ru" : "en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="max-w-[200px] truncate px-3.5 py-2" title={`${rec.provider}/${rec.model}`}>
                        <span className="mr-1 text-[10px] text-muted-foreground">{rec.provider}/</span>
                        <span className="font-medium text-foreground">{rec.model}</span>
                      </td>
                      <td className="px-3.5 py-2 text-right text-muted-foreground">
                        {rec.promptTokens.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2 text-right text-muted-foreground">
                        {rec.completionTokens.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2 text-right font-semibold text-foreground">
                        {rec.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2 text-right text-[10px] text-muted-foreground">
                        {rec.durationMs > 0 ? `${(rec.durationMs / 1000).toFixed(1)}${lang === "ru" ? "с" : "s"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
