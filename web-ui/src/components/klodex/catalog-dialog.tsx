import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  Layers,
  MessageSquare,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  api,
  type CatalogResponse,
  type PromptItem,
  type PromptType,
  type SkillItem,
} from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectDir?: string;
  onRefreshSlashCommands?: () => Promise<void>;
}

type MainTab = "registry" | "installed";
type KindFilter = "all" | "skill" | "prompt" | "prompt_system" | "prompt_user" | "prompt_composite";

export function CatalogDialog({ open, onOpenChange, projectDir, onRefreshSlashCommands }: Props) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<MainTab>("registry");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [previewItem, setPreviewItem] = useState<{ title: string; typeStr: string; content: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.skillsCatalog(projectDir);
      setCatalog(data);
      if (onRefreshSlashCommands) {
        await onRefreshSlashCommands();
      }
    } catch (e) {
      console.error("Failed to load catalog:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, projectDir]);

  const handleInstall = async (type: "skill" | "prompt", id: string, path: string) => {
    setActionLoading(`install-${id}`);
    try {
      await api.installSkillOrPrompt(type, id, path);
      await loadData();
    } catch (e) {
      console.error("Install error:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async (type: "skill" | "prompt", id: string) => {
    setActionLoading(`uninstall-${id}`);
    try {
      await api.uninstallSkillOrPrompt(type, id);
      await loadData();
    } catch (e) {
      console.error("Uninstall error:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (type: "skill" | "prompt", id: string, currentEnabled: boolean) => {
    setActionLoading(`toggle-${id}`);
    try {
      await api.toggleSkillOrPrompt(type, id, !currentEnabled);
      await loadData();
    } catch (e) {
      console.error("Toggle error:", e);
    } finally {
      setActionLoading(null);
    }
  };

  // Combine skills & prompts into a unified list with clear typing
  type UnifiedItem = {
    uniqueId: string;
    id: string;
    name: string;
    kind: "skill" | "prompt";
    promptType?: PromptType;
    slash?: string;
    category?: string;
    version?: string;
    author?: string;
    description: string;
    triggers?: string[];
    tags?: string[];
    path?: string;
    isInstalled: boolean;
    isEnabled: boolean;
    isProjectLevel?: boolean;
    rawContent?: string;
  };

  const allItems: UnifiedItem[] = useMemo(() => {
    if (!catalog) return [];
    const list: UnifiedItem[] = [];

    for (const s of catalog.skills) {
      list.push({
        uniqueId: `skill-${s.id}`,
        id: s.id,
        name: s.name,
        kind: "skill",
        category: s.category,
        version: s.version,
        author: s.author,
        description: s.description,
        triggers: s.triggers,
        tags: s.tags,
        path: s.path,
        isInstalled: Boolean(s.isInstalled),
        isEnabled: Boolean(s.isEnabled),
        isProjectLevel: s.isProjectLevel,
        rawContent: s.body,
      });
    }

    for (const p of catalog.prompts) {
      list.push({
        uniqueId: `prompt-${p.id}`,
        id: p.id,
        name: p.name,
        kind: "prompt",
        promptType: p.type,
        slash: p.slash,
        category: p.category,
        version: p.version,
        author: p.author,
        description: p.description,
        tags: p.tags,
        path: p.path,
        isInstalled: Boolean(p.isInstalled),
        isEnabled: Boolean(p.isEnabled),
        isProjectLevel: p.isProjectLevel,
        rawContent: p.rawBody || [p.systemContent ? `## System\n${p.systemContent}` : "", p.userContent ? `## User\n${p.userContent}` : ""].filter(Boolean).join("\n\n"),
      });
    }

    return list;
  }, [catalog]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Tab filter
      if (tab === "installed" && !item.isInstalled) return false;

      // Category filter
      if (category !== "all" && item.category !== category) return false;

      // Kind filter
      if (kind === "skill" && item.kind !== "skill") return false;
      if (kind === "prompt" && item.kind !== "prompt") return false;
      if (kind === "prompt_system" && (item.kind !== "prompt" || item.promptType !== "system")) return false;
      if (kind === "prompt_user" && (item.kind !== "prompt" || item.promptType !== "user")) return false;
      if (kind === "prompt_composite" && (item.kind !== "prompt" || item.promptType !== "composite")) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const inName = item.name.toLowerCase().includes(q);
        const inDesc = item.description.toLowerCase().includes(q);
        const inSlash = item.slash ? item.slash.toLowerCase().includes(q) : false;
        const inTriggers = item.triggers ? item.triggers.some((t) => t.toLowerCase().includes(q)) : false;
        if (!inName && !inDesc && !inSlash && !inTriggers) return false;
      }

      return true;
    });
  }, [allItems, tab, category, kind, search]);

  const installedCount = useMemo(() => allItems.filter((i) => i.isInstalled).length, [allItems]);
  const activeCount = useMemo(() => allItems.filter((i) => i.isInstalled && i.isEnabled).length, [allItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[800px] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-border/60 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Boxes className="size-5" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg font-semibold tracking-tight text-foreground">
                  {t("catalog.title")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ru"
                    ? "Каталог готовых модулей поведения, системных ролей и слеш-команд"
                    : "Catalog of prebuilt behaviors, system roles, and slash commands"}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="h-8 gap-1.5 text-xs font-mono"
                title={lang === "ru" ? "Обновить каталог из GitHub" : "Refresh catalog from GitHub"}
              >
                <RotateCcw className={cn("size-3.5", loading && "animate-spin")} />
                <span>{lang === "ru" ? "Обновить" : "Refresh"}</span>
              </Button>
            </div>
          </div>

          {/* Main Tabs */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setTab("registry")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                tab === "registry"
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <Sparkles className="size-3.5" />
              <span>{t("catalog.catalogTab")}</span>
              {catalog && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {allItems.length}
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab("installed")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                tab === "installed"
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <CheckCircle2 className="size-3.5" />
              <span>{t("catalog.myLibrary")}</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {activeCount}/{installedCount}
              </Badge>
            </button>
          </div>

          {/* Filters & Search bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("catalog.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/40 border-border/50"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
              <button
                type="button"
                onClick={() => setKind("all")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap",
                  kind === "all" ? "bg-primary text-primary-foreground font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {t("catalog.all")}
              </button>
              <button
                type="button"
                onClick={() => setKind("skill")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1",
                  kind === "skill" ? "bg-purple-600 text-white font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="size-2.5" />
                {t("catalog.skills")}
              </button>
              <button
                type="button"
                onClick={() => setKind("prompt_system")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1",
                  kind === "prompt_system" ? "bg-sky-600 text-white font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Terminal className="size-2.5" />
                {lang === "ru" ? "Промпт: System" : "Prompt: System"}
              </button>
              <button
                type="button"
                onClick={() => setKind("prompt_user")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1",
                  kind === "prompt_user" ? "bg-emerald-600 text-white font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="size-2.5" />
                {lang === "ru" ? "Промпт: User" : "Prompt: User"}
              </button>
              <button
                type="button"
                onClick={() => setKind("prompt_composite")}
                className={cn(
                  "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1",
                  kind === "prompt_composite" ? "bg-amber-600 text-white font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Layers className="size-2.5" />
                {lang === "ru" ? "Промпт: 1+2" : "Prompt: 1+2"}
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 chat-scroll">
          {filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <Boxes className="size-10 mb-2 opacity-30" />
              <div className="text-sm font-medium">{t("catalog.nothingFound")}</div>
              <div className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
                {tab === "installed"
                  ? t("catalog.emptyLibrary")
                  : t("catalog.emptySearch")}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isSkill = item.kind === "skill";
                const isSystemPrompt = item.kind === "prompt" && item.promptType === "system";
                const isUserPrompt = item.kind === "prompt" && item.promptType === "user";
                const isCompositePrompt = item.kind === "prompt" && item.promptType === "composite";

                return (
                  <div
                    key={item.uniqueId}
                    className={cn(
                      "group relative p-4 rounded-xl border transition-all flex flex-col justify-between",
                      item.isInstalled
                        ? item.isEnabled
                          ? "bg-accent/20 border-border shadow-xs"
                          : "bg-muted/20 border-border/50 opacity-75"
                        : "bg-card/50 border-border/40 hover:border-border hover:bg-card"
                    )}
                  >
                    <div>
                      {/* Top Badges & Kind Indicator */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center flex-wrap gap-1.5">
                          {isSkill && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-medium bg-purple-500/10 text-purple-400 border-purple-500/30 flex items-center gap-1"
                            >
                              <Sparkles className="size-2.5" />
                              {t("catalog.skillBadge")}
                            </Badge>
                          )}
                          {isSystemPrompt && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-medium bg-sky-500/10 text-sky-400 border-sky-500/30 flex items-center gap-1"
                            >
                              <Terminal className="size-2.5" />
                              {lang === "ru" ? "Промпт: System (1)" : "Prompt: System (1)"}
                            </Badge>
                          )}
                          {isUserPrompt && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1"
                            >
                              <MessageSquare className="size-2.5" />
                              {lang === "ru" ? "Промпт: User (2)" : "Prompt: User (2)"}
                            </Badge>
                          )}
                          {isCompositePrompt && (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1"
                            >
                              <Layers className="size-2.5" />
                              {lang === "ru" ? "Промпт: 1+2 Composite" : "Prompt: 1+2 Composite"}
                            </Badge>
                          )}

                          {item.slash && (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[10px] font-mono font-medium text-foreground bg-muted border border-border/60"
                            >
                              {item.slash}
                            </Badge>
                          )}

                          {item.version && (
                            <span className="text-[10px] text-muted-foreground/70 font-mono">
                              v{item.version}
                            </span>
                          )}
                        </div>

                        {/* Status tag */}
                        {item.isInstalled && (
                          <div className="flex items-center gap-1 shrink-0">
                            {item.isEnabled ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                                {t("catalog.active")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-muted-foreground border-border/60">
                                {t("catalog.disabled")}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Name & Description */}
                      <h4 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {item.author && (
                          <span className="text-[11px] text-muted-foreground font-normal">
                            {lang === "ru" ? `от @${item.author}` : `by @${item.author}`}
                          </span>
                        )}
                      </h4>

                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Triggers list for skills */}
                      {item.triggers && item.triggers.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1 mt-2.5">
                          <span className="text-[10px] text-muted-foreground/60 mr-0.5">{t("catalog.triggers")}</span>
                          {item.triggers.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted/60 text-muted-foreground border border-border/40"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/40">
                      {/* Preview button */}
                      {item.rawContent ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPreviewItem({
                              title: item.name,
                              typeStr: isSkill ? t("catalog.skillBadge") : item.promptType ? `${t("catalog.promptBadge")}: ${item.promptType}` : t("catalog.promptBadge"),
                              content: item.rawContent || "",
                            })
                          }
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        >
                          <Eye className="size-3" />
                          <span>{t("catalog.previewBtn")}</span>
                        </Button>
                      ) : (
                        <div />
                      )}

                      {/* Controls */}
                      <div className="flex items-center gap-1.5">
                        {item.isInstalled ? (
                          <>
                            {/* Toggle active switch */}
                            <Button
                              variant={item.isEnabled ? "default" : "outline"}
                              size="sm"
                              disabled={Boolean(actionLoading)}
                              onClick={() => handleToggle(item.kind, item.id, item.isEnabled)}
                              className="h-7 px-2.5 text-xs gap-1 font-medium"
                              title={item.isEnabled ? t("catalog.disable") : t("catalog.enable")}
                            >
                              <Power className="size-3" />
                              <span>{item.isEnabled ? (lang === "ru" ? "Вкл" : "On") : (lang === "ru" ? "Выкл" : "Off")}</span>
                            </Button>

                            {/* Delete button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(actionLoading)}
                              onClick={() => handleUninstall(item.kind, item.id)}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title={lang === "ru" ? "Удалить с диска" : "Delete from disk"}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={Boolean(actionLoading) || !item.path}
                            onClick={() => handleInstall(item.kind, item.id, item.path!)}
                            className="h-7 px-3 text-xs gap-1.5 font-medium"
                          >
                            <Download className="size-3" />
                            <span>{t("catalog.install")}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 px-6 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-2">
            <span>{lang === "ru" ? "Источник:" : "Source:"}</span>
            <a
              href="https://github.com/lonestill/klodex-skills"
              target="_blank"
              rel="noreferrer"
              className="text-foreground hover:underline font-mono"
            >
              lonestill/klodex-skills
            </a>
          </div>
          <div>
            {lang === "ru" ? (
              <>Слеш-команды вызываются через <kbd className="px-1 py-0.5 rounded bg-muted border font-mono text-[10px]">/</kbd> в чате</>
            ) : (
              <>Slash commands are called via <kbd className="px-1 py-0.5 rounded bg-muted border font-mono text-[10px]">/</kbd> in chat</>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Markdown Preview Dialog */}
      {previewItem && (
        <Dialog open={Boolean(previewItem)} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="flex max-h-[75vh] max-w-2xl flex-col rounded-2xl border-border/60 bg-popover/95 p-6 shadow-2xl backdrop-blur-xl">
            <DialogHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {previewItem.typeStr}
                </Badge>
                <DialogTitle className="font-display text-base font-semibold tracking-tight text-foreground">
                  {previewItem.title}
                </DialogTitle>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto mt-4 p-4 rounded-lg bg-muted/40 border font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed chat-scroll">
              {previewItem.content}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
