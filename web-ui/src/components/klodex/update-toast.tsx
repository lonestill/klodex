import { ArrowUpCircle, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/lib/api";

interface Props {
  status: UpdateStatus | null;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

/**
 * Micro-notification in the bottom-right corner shown when the background
 * watcher reports a new commit/release. Clicking it jumps straight to
 * Settings → Обновления, where the one-click updater lives.
 */
export function UpdateToast({ status, onOpenSettings, onDismiss }: Props) {
  if (!status?.hasUpdate) return null;

  const detail =
    status.updateType === "release"
      ? `версия ${status.latestVersion}`
      : status.commitsBehind
        ? `${status.commitsBehind} новых коммитов`
        : (status.latestVersion ?? "новая версия");

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex justify-end">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-card/95 py-1.5 pl-2.5 pr-1.5 text-xs shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
        <ArrowUpCircle className="size-4 shrink-0 text-amber-500" />
        <div className="leading-tight">
          <div className="font-semibold text-foreground">Доступно обновление</div>
          <div className="text-[11px] text-muted-foreground">{detail}</div>
        </div>
        <Button
          size="xs"
          variant="outline"
          className="h-6 gap-1 text-[11px]"
          onClick={onOpenSettings}
          title="Открыть Настройки → Обновления"
        >
          <Settings2 className="size-3" />
          Обновить
        </Button>
        <button
          onClick={onDismiss}
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Скрыть до следующей версии"
          aria-label="Скрыть уведомление"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
