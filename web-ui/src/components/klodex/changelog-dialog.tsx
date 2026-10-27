import { useEffect, useState } from "react";
import { AlertCircle, GitCommitHorizontal, Loader2, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type ChangelogResponse, type UpdateStatus } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UpdateStatus | null;
}

/** Viewer for CHANGELOG.md shown from the update toast; highlights versions the user has not seen. */
export function ChangelogDialog({ open, onOpenChange, status }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setError("");
    api
      .changelog()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const versionDiff =
    status?.latestVersion && status.latestVersion !== status.currentVersion
      ? `v${status.currentVersion} → v${status.latestVersion}`
      : "";

  const hasContent = Boolean(data && (data.entries.length > 0 || data.commits.length > 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <ScrollText className="size-4 text-primary" />
            {t("changelog.title")}
            {versionDiff && (
              <Badge
                variant="outline"
                className="h-4 px-1 font-mono text-[10px] border-primary/30 text-primary bg-primary/5"
              >
                {versionDiff}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("changelog.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              {t("changelog.error")}
            </div>
          )}

          {!error && !data && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("changelog.loading")}
            </div>
          )}

          {data && !hasContent && (
            <p className="py-8 text-center text-xs text-muted-foreground">{t("changelog.empty")}</p>
          )}

          {data &&
            data.entries.map((entry) => {
              const unreleased = entry.version.toLowerCase() === "unreleased";
              return (
                <section
                  key={`${entry.version}-${entry.date ?? ""}`}
                  className="mb-4 border-b border-border/40 pb-4 last:mb-0 last:border-0 last:pb-0"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">
                      {unreleased ? t("changelog.unreleased") : `v${entry.version}`}
                    </span>
                    {entry.date && <span className="text-[10px] text-muted-foreground">{entry.date}</span>}
                    {data.newVersions.includes(entry.version) && (
                      <Badge
                        variant="outline"
                        className="h-4 px-1.5 text-[10px] border-primary/30 bg-primary/15 text-primary"
                      >
                        {t("changelog.new")}
                      </Badge>
                    )}
                  </div>
                  {entry.sections.map((section, si) => (
                    <div key={si} className="mb-2 last:mb-0">
                      {section.title && (
                        <p className="mb-1 text-[11px] font-medium text-foreground/90">{section.title}</p>
                      )}
                      <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
                        {section.items.map((item, ii) => (
                          <li key={ii}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              );
            })}

          {data && data.commits.length > 0 && (
            <section className={data.entries.length > 0 ? "mt-5" : ""}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <GitCommitHorizontal className="size-3.5" />
                {t("changelog.commits")}
              </h3>
              <ul className="space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {data.commits.map((commit, i) => (
                  <li key={i}>{commit}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
