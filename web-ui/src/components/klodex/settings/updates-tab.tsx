import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  RotateCcw,
  ScrollText,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { cn } from "@/lib/utils";
import { useI18n, commitsLabel, commitsAvailableText } from "@/lib/i18n";
import type { UpdateStatus } from "@/lib/api";

interface UpdatesTabProps {
  updateStatus: UpdateStatus | null;
  checkingUpdate: boolean;
  applyingUpdate: boolean;
  restartingServer: boolean;
  updateDone: boolean;
  updateProgress: number;
  updatePhase: string;
  updateLog: string | null;
  updateMessage: string | null;
  showUpdateLog: boolean;
  setShowUpdateLog: React.Dispatch<React.SetStateAction<boolean>>;
  copiedLog: boolean;
  handleCheckUpdate: () => Promise<void>;
  handleApplyUpdate: () => Promise<void>;
  handleCopyLog: () => Promise<void>;
  onOpenChangelog: () => void;
  onOpenOnboarding: () => void;
}

export function UpdatesTab({
  updateStatus,
  checkingUpdate,
  applyingUpdate,
  restartingServer,
  updateDone,
  updateProgress,
  updatePhase,
  updateLog,
  updateMessage,
  showUpdateLog,
  setShowUpdateLog,
  copiedLog,
  handleCheckUpdate,
  handleApplyUpdate,
  handleCopyLog,
  onOpenChangelog,
  onOpenOnboarding,
}: UpdatesTabProps) {
  const { t, lang } = useI18n();

  return (
    <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
      {/* Top Control Bar: Brand + Repo + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-xs">
            <KlodexIcon size={20} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-foreground">Klodex Core</span>
              {updateStatus?.currentVersion && (
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30">
                  v{updateStatus.currentVersion}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <a
                href="https://github.com/lonestill/klodex"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <GitBranch className="size-3 text-muted-foreground/80" />
                <span>lonestill/klodex</span>
                <ExternalLink className="size-2.5 opacity-60" />
              </a>
              <span>·</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground">
                {updateStatus?.isGitRepo ? t("updates.gitTracking") : t("updates.httpArchive")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 cursor-pointer shadow-xs border-border/60 bg-background/50 hover:bg-background/80"
            disabled={checkingUpdate || applyingUpdate}
            onClick={onOpenChangelog}
          >
            <ScrollText className="size-3.5" />
            {t("toast.whatsNew")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 cursor-pointer shadow-xs border-border/60 bg-background/50 hover:bg-background/80"
            disabled={checkingUpdate || applyingUpdate}
            onClick={() => void handleCheckUpdate()}
          >
            <RotateCcw className={cn("size-3.5", checkingUpdate && "animate-spin")} />
            {checkingUpdate ? t("updates.checking") : t("updates.checkBtn")}
          </Button>
        </div>
      </div>

      {/* Active Update / Restart Progress Card */}
      {(applyingUpdate || restartingServer) && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4 shadow-xs backdrop-blur-sm transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-foreground font-medium text-sm">
              <Loader2 className={cn("size-4 animate-spin", restartingServer ? "text-emerald-400" : "text-primary")} />
              <span className="font-display">{restartingServer ? t("updates.restarting") : updatePhase || t("updates.checking")}</span>
            </div>
            <span className="font-mono text-sm font-bold text-primary">
              {updateProgress}%
            </span>
          </div>

          <Progress
            value={updateProgress}
            indicatorClassName={restartingServer ? "bg-emerald-500" : "bg-primary"}
            className="h-2"
          />

          {/* 4-Phase Stepper */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            {[
              { label: t("updates.step1"), target: 30 },
              { label: t("updates.step2"), target: 65 },
              { label: t("updates.step3"), target: 88 },
              { label: t("updates.step4"), target: 100 },
            ].map((step, idx) => {
              const isCompleted = updateProgress >= step.target;
              const isCurrent = updateProgress < step.target && (idx === 0 || updateProgress >= [0, 30, 65, 88][idx]);
              return (
                <div
                  key={step.label}
                  className={cn(
                    "rounded-xl p-2.5 border text-center transition-colors",
                    isCompleted
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                      : isCurrent
                        ? "border-primary/40 bg-primary/10 text-foreground font-semibold"
                        : "border-border/40 bg-muted/20 text-muted-foreground opacity-60",
                  )}
                >
                  <div className="flex items-center justify-center gap-1.5 font-mono text-[10px]">
                    {isCompleted ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="size-3 animate-spin text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    )}
                    <span>{step.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {restartingServer ? t("toast.restartDesc") : t("toast.applyingDesc")}
          </p>
        </div>
      )}

      {/* Status Hero Card (when not currently updating) */}
      {!applyingUpdate && !restartingServer && (
        updateStatus?.hasUpdate ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4 shadow-xs backdrop-blur-sm transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
                  </span>
                  <span className="font-display font-semibold text-sm text-foreground">
                    {t("updates.available")}
                  </span>
                  <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 font-mono text-[11px] h-5 px-1.5">
                    v{updateStatus.currentVersion} → v{updateStatus.latestVersion ?? "latest"}
                  </Badge>
                  {Boolean(updateStatus.commitsBehind) && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {commitsLabel(updateStatus.commitsBehind ?? 0, lang)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {updateStatus.commitsBehind
                    ? commitsAvailableText(updateStatus.commitsBehind, lang)
                    : updateStatus.message || t("toast.defaultMessage")}
                </p>
              </div>

              <Button
                size="sm"
                className="h-9 px-4 gap-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer shrink-0"
                onClick={() => void handleApplyUpdate()}
              >
                <Download className="size-3.5" />
                <span>{t("updates.applyWithRestart")}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center shrink-0 mt-0.5 border border-emerald-500/20">
                <Check className="size-4" />
              </div>
              <div className="space-y-0.5">
                <div className="font-display font-semibold text-xs text-foreground flex items-center gap-2">
                  <span>{t("updates.upToDate")}</span>
                  {updateStatus?.currentVersion && (
                    <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 h-4">
                      v{updateStatus.currentVersion}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {lang === "ru"
                    ? "Все модули, модели и тулы обновлены до последней стабильной ревизии."
                    : "All modules, models, and tools are updated to the latest stable revision."}
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Warning if Git CLI missing */}
      {updateStatus && !updateStatus.hasGitCli && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3 text-xs text-amber-500/95 leading-relaxed shadow-xs">
          <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <span className="font-semibold block text-foreground">{t("updates.gitMissing")}</span>
            <span className="text-[11px] text-muted-foreground">
              {t("updates.gitMissingDesc")}
            </span>
          </div>
        </div>
      )}

      {/* Release Notes / Commits Log */}
      {updateStatus?.releaseNotes && !applyingUpdate && !restartingServer && (
        <div className="rounded-2xl border border-border/50 bg-card/40 p-4 space-y-2.5 shadow-xs backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <GitBranch className="size-3.5 text-muted-foreground" />
            <span>{t("updates.recentCommits")}</span>
          </div>
          <div className="chat-scroll max-h-[140px] overflow-y-auto rounded-xl border border-border/60 bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {updateStatus.releaseNotes}
          </div>
        </div>
      )}

      {/* Collapsible Terminal Log */}
      {updateLog && (
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setShowUpdateLog((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Terminal className="size-3.5" />
            <span>{t("updates.buildLog")}</span>
            {showUpdateLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>

          {showUpdateLog && (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-xl space-y-0 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-rose-500/80" />
                    <span className="size-2.5 rounded-full bg-amber-500/80" />
                    <span className="size-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    klodex-updater.log
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 font-mono text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground cursor-pointer"
                  onClick={() => void handleCopyLog()}
                >
                  {copiedLog ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">{t("common.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>{t("updates.copyLog")}</span>
                    </>
                  )}
                </Button>
              </div>

              <pre className="chat-scroll max-h-[160px] overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-emerald-400 select-text">
                {updateLog}
              </pre>
            </div>
          )}
        </div>
      )}

      {updateMessage && !updateDone && (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/60 p-3 text-xs text-foreground">
          <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
          <span className="leading-relaxed">{updateMessage}</span>
        </div>
      )}

      {/* Maintenance & Onboarding Card */}
      <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4 shadow-xs">
        <div className="space-y-0.5">
          <span className="font-display text-xs font-semibold block text-foreground">{t("settings.onboardingHero")}</span>
          <span className="text-[11px] text-muted-foreground leading-relaxed">
            {t("settings.onboardingHeroDesc")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs cursor-pointer shrink-0 self-start sm:self-auto border-border/60 bg-background/50 hover:bg-background/80"
          onClick={onOpenOnboarding}
        >
          <Compass className="size-3.5" />
          {t("settings.launchOnboarding")}
        </Button>
      </div>
    </div>
  );
}
