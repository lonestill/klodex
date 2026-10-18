import { useState } from "react";
import {
  Sparkles,
  Download,
  CheckCircle2,
  RotateCcw,
  Settings2,
  X,
  Terminal,
  ChevronDown,
  ChevronUp,
  GitBranch,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { api, type UpdateStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  status: UpdateStatus | null;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * Modern floating HUD updater card in bottom-right corner.
 * Allows instant 1-click update directly in-place with real progress,
 * terminal logs preview, and quick reload.
 */
export function UpdateToast({ status, onOpenSettings, onDismiss }: Props) {
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  if (!status?.hasUpdate) return null;

  const handleUpdate = async () => {
    setApplying(true);
    setError(null);
    try {
      const res = await api.applyUpdate();
      setLog(res.log);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.message || "Ошибка обновления репозитория");
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setApplying(false);
    }
  };

  const versionDiff =
    status.latestVersion && status.latestVersion !== status.currentVersion
      ? `v${status.currentVersion} → v${status.latestVersion}`
      : status.commitsBehind
        ? `+${status.commitsBehind} новых коммитов`
        : `v${status.latestVersion ?? "новая версия"}`;

  return (
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
                <span>Обновление Klodex</span>
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
            title="Скрыть"
            aria-label="Скрыть уведомление"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Content body */}
        <div className="py-2.5 space-y-2">
          {done ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Klodex успешно обновлён!</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Файлы и сборка обновлены. Нажми кнопку ниже для перезагрузки интерфейса.
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 space-y-1 text-destructive">
              <div className="flex items-center gap-1.5 font-medium text-[11px]">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Ошибка обновления</span>
              </div>
              <p className="text-[10px] text-destructive/90 leading-relaxed font-mono whitespace-pre-wrap">
                {error}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {status.message || "Доступны свежие коммиты и улучшения. Обнови Klodex в один клик без терминала."}
            </p>
          )}

          {/* Collapsible terminal log */}
          {log && (
            <div className="space-y-1 pt-1">
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Terminal className="size-3" />
                <span>Лог сборки</span>
                {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
              {showLog && (
                <pre className="rounded-lg bg-zinc-950 p-2.5 font-mono text-[10px] text-zinc-300 border border-zinc-800/80 max-h-36 overflow-auto whitespace-pre leading-relaxed">
                  {log}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {done ? (
            <Button
              size="sm"
              className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5 cursor-pointer shadow-sm"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="size-3.5" />
              Перезагрузить страницу
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer px-2"
                onClick={onOpenSettings}
                disabled={applying}
              >
                <Settings2 className="size-3.5" />
                Детали
              </Button>

              <Button
                size="sm"
                className="h-8 flex-1 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
                disabled={applying}
                onClick={handleUpdate}
              >
                {applying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Сборка…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-primary-foreground/90" />
                    <span>Обновить сейчас</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
