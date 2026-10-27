import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Settings2,
  X,
  GitBranch,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { ChangelogDialog } from "@/components/klodex/changelog-dialog";
import { api, type UpdateStatus } from "@/lib/api";
import { useI18n, commitsLabel, commitsAvailableText } from "@/lib/i18n";

interface Props {
  status: UpdateStatus | null;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * Modern floating HUD updater card in bottom-right corner.
 * Features a sleek progress bar, zero annoying logs by default,
 * and automatic full software restart + page reload upon completion.
 */
export function UpdateToast({ status, onOpenSettings, onDismiss }: Props) {
  const { t, lang } = useI18n();
  const [applying, setApplying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseText, setPhaseText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  if (!status?.hasUpdate) return null;

  const handleUpdate = async () => {
    setApplying(true);
    setError(null);
    setProgress(10);
    setPhaseText(t("toast.phaseChecking"));

    // Smooth progress simulation while backend runs git pull, bun install, and bun build
    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) {
          setPhaseText(t("toast.phasePulling"));
          return prev + 6;
        }
        if (prev < 65) {
          setPhaseText(t("toast.phaseDeps"));
          return prev + 4;
        }
        if (prev < 88) {
          setPhaseText(t("toast.phaseBuild"));
          return prev + 2;
        }
        return prev;
      });
    }, 350);

    try {
      const res = await api.applyUpdate();
      setLog(res.log);

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      if (res.ok) {
        setProgress(100);
        setPhaseText(t("toast.phaseRestart"));
        setRestarting(true);

        // Server restarts automatically in background; poll /api/health until it is back up
        const startTime = Date.now();
        pollTimerRef.current = setInterval(async () => {
          try {
            if (Date.now() - startTime < 1200) return;
            const health = await api.health();
            if (health?.ok) {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              setPhaseText(t("toast.phaseDone"));
              setTimeout(() => {
                window.location.reload();
              }, 300);
            }
          } catch {
            // Server process is restarting, wait for next poll
          }

          if (Date.now() - startTime > 20000) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            window.location.reload();
          }
        }, 500);
      } else {
        setApplying(false);
        setProgress(0);
        setError(res.message || t("toast.error"));
      }
    } catch (err: any) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setApplying(false);
      setProgress(0);
      setError(err?.message ?? String(err));
    }
  };

  const versionDiff =
    status.latestVersion && status.latestVersion !== status.currentVersion
      ? `v${status.currentVersion} → v${status.latestVersion}`
      : status.commitsBehind
        ? commitsLabel(status.commitsBehind, lang)
        : `v${status.latestVersion ?? t("toast.newVersion")}`;

  return (
    <>
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex justify-end">
      <div className="pointer-events-auto w-[380px] rounded-2xl border border-border/80 bg-background/95 p-4 text-xs shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ring-1 ring-white/5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <KlodexIcon size={15} />
              <span className="absolute -top-0.5 -right-0.5 flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-violet-500" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-foreground flex items-center gap-1.5 leading-tight">
                <span>{t("toast.title")}</span>
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[10px] font-mono border-primary/30 text-primary bg-primary/5"
                >
                  {versionDiff}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <GitBranch className="size-3 shrink-0 opacity-70" />
                <span className="truncate">lonestill/klodex · main</span>
              </div>
            </div>
          </div>

          <button
            onClick={onDismiss}
            disabled={applying}
            className="size-6 shrink-0 grid place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer disabled:opacity-40"
            title={t("toast.dismiss")}
            aria-label={t("toast.dismiss")}
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Content body */}
        <div className="py-2.5 space-y-2.5">
          {restarting ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-emerald-400 font-medium">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-emerald-400" />
                  <span>{t("toast.restarting")}</span>
                </span>
                <span className="font-mono text-[11px]">100%</span>
              </div>
              <Progress value={100} indicatorClassName="bg-emerald-500" />
              <p className="text-[11px] text-muted-foreground">
                {t("toast.restartDesc")}
              </p>
            </div>
          ) : applying ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between text-foreground font-medium">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span className="truncate">{phaseText || t("toast.phaseBuild")}</span>
                </span>
                <span className="font-mono text-xs text-primary font-bold">{progress}%</span>
              </div>
              <Progress value={progress} indicatorClassName="bg-primary" />
              <p className="text-[10px] text-muted-foreground">
                {t("toast.applyingDesc")}
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 space-y-1.5 text-destructive">
              <div className="flex items-center gap-1.5 font-medium text-[11px]">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{t("toast.error")}</span>
              </div>
              <p className="text-[10px] text-destructive/90 leading-relaxed font-mono whitespace-pre-wrap">
                {error}
              </p>
              {log && (
                <button
                  type="button"
                  onClick={() => setShowLog((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-mono text-destructive hover:underline cursor-pointer pt-0.5"
                >
                  <span>{showLog ? t("toast.hideLog") : t("toast.showLog")}</span>
                  {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              )}
              {showLog && log && (
                <pre className="rounded-lg bg-zinc-950 p-2 font-mono text-[9px] text-zinc-300 border border-zinc-800/80 max-h-32 overflow-auto whitespace-pre leading-relaxed">
                  {log}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {status.commitsBehind
                ? commitsAvailableText(status.commitsBehind, lang)
                : status.message || t("toast.defaultMessage")}
            </p>
          )}
        </div>

        {/* Actions Footer */}
        {!applying && !restarting && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-0.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer px-2"
                onClick={onOpenSettings}
              >
                <Settings2 className="size-3.5" />
                {t("toast.details")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer px-2"
                onClick={() => setChangelogOpen(true)}
              >
                <ScrollText className="size-3.5" />
                {t("toast.whatsNew")}
              </Button>
            </div>

            <Button
              size="sm"
              className="h-8 flex-1 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
              onClick={handleUpdate}
            >
              <Sparkles className="size-3.5 text-primary-foreground/90" />
              <span>{t("toast.updateNow")}</span>
            </Button>
          </div>
        )}
      </div>
    </div>

      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} status={status} />
    </>
  );
}
