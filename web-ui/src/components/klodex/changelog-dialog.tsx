import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  ScrollText,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type ChangelogResponse, type ChangelogSection, type UpdateStatus } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: UpdateStatus | null;
}

const CHANGELOG_URL = "https://github.com/lonestill/klodex/blob/main/CHANGELOG.md";

/** Semantic accent per section title: Added / Changed / Fixed fall back to primary. */
function sectionAccent(title: string): { dot: string; text: string; icon: typeof CheckCircle2 } {
  const t = title.toLowerCase();
  if (/добавлен|added|feat/.test(t)) {
    return { dot: "bg-emerald-400", text: "text-emerald-400", icon: CheckCircle2 };
  }
  if (/изменен|изменён|changed|refactor|breaking/.test(t)) {
    return { dot: "bg-amber-400", text: "text-amber-400", icon: Wrench };
  }
  if (/исправлен|fixed|fix/.test(t)) {
    return { dot: "bg-rose-400", text: "text-rose-400", icon: AlertCircle };
  }
  return { dot: "bg-primary", text: "text-foreground", icon: CheckCircle2 };
}

function Section({ section }: { section: ChangelogSection }) {
  const accent = sectionAccent(section.title);
  const Icon = accent.icon;
  return (
    <div>
      {section.title && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Icon className={`size-3 ${accent.text}`} />
          <span className={`text-[11px] font-semibold ${accent.text}`}>{section.title}</span>
        </div>
      )}
      <ul className="space-y-1 pl-4.5 text-[11.5px] leading-relaxed text-muted-foreground">
        {section.items.map((item, ii) => (
          <li key={ii} className="relative pl-2 before:absolute before:left-[-9px] before:top-[0.55em] before:size-1 before:rounded-full before:bg-muted-foreground/50">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Viewer for CHANGELOG.md shown from the update toast and Settings → Updates; highlights versions the user has not seen. */
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
  const firstNewIdx = data ? data.entries.findIndex((e) => data.newVersions.includes(e.version)) : -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,700px)] max-w-xl flex-col gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-card/40 p-5 pr-12 text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <ScrollText className="size-4" />
            </div>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              {t("changelog.title")}
              {versionDiff && (
                <Badge
                  variant="outline"
                  className="h-4.5 border-primary/30 bg-primary/5 px-1.5 font-mono text-[10px] text-primary"
                >
                  {versionDiff}
                </Badge>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 pl-[42px] text-xs">
            {t("changelog.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto p-5">
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
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("changelog.loading")}
            </div>
          )}

          {data && !hasContent && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ScrollText className="size-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">{t("changelog.empty")}</p>
            </div>
          )}

          {data &&
            data.entries.map((entry, ei) => {
              const unreleased = entry.version.toLowerCase() === "unreleased";
              const isNew = data.newVersions.includes(entry.version);
              const highlighted = isNew && ei === firstNewIdx;
              return (
                <section
                  key={`${entry.version}-${entry.date ?? ""}`}
                  className={
                    highlighted
                      ? "mb-4 rounded-xl border border-primary/25 bg-primary/5 p-4 last:mb-0"
                      : "mb-4 border-b border-border/40 pb-4 last:mb-0 last:border-0 last:pb-0"
                  }
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-foreground">
                      {unreleased ? t("changelog.unreleased") : `v${entry.version}`}
                    </span>
                    {entry.date && <span className="text-[10.5px] text-muted-foreground">{entry.date}</span>}
                    {isNew && (
                      <Badge
                        variant="outline"
                        className="h-4 border-primary/40 bg-primary/15 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-primary"
                      >
                        {t("changelog.new")}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-3">
                    {entry.sections.map((section, si) => (
                      <Section key={si} section={section} />
                    ))}
                  </div>
                </section>
              );
            })}

          {data && data.commits.length > 0 && (
            <section className="mt-2">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
                {t("changelog.commits")}
              </h3>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-950/70 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 chat-scroll">
                {data.commits.map((commit, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {commit}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-card/40 px-5 py-3">
          <span className="font-mono text-[10px] text-muted-foreground">
            {data ? `v${data.currentVersion}` : ""}
          </span>
          <a
            href={CHANGELOG_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>CHANGELOG.md</span>
            <ExternalLink className="size-3 opacity-60" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
