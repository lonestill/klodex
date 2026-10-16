import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Download,
  Eye,
  Layers,
  MessageSquare,
  Play,
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  api,
  type CatalogResponse,
  type PromptType,
} from "@/lib/api";

interface Props {
  projectDir?: string;
  onClose: () => void;
  onApplyPromptToChat?: (slash: string) => void;
}

type MainTab = "registry" | "installed";
type KindFilter = "all" | "skill" | "prompt" | "prompt_system" | "prompt_user" | "prompt_composite";

export function CatalogView({ projectDir, onClose, onApplyPromptToChat }: Props) {
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
    } catch (e) {
      console.error("Failed to load catalog:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectDir]);

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
        rawContent:
          p.rawBody ||
          [p.systemContent ? `## System\n${p.systemContent}` : "", p.userContent ? `## User\n${p.userContent}` : ""]
            .filter(Boolean)
            .join("\n\n"),
      });
    }

    return list;
  }, [catalog]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (tab === "installed" && !item.isInstalled) return false;
      if (category !== "all" && item.category !== category) return false;

      if (kind === "skill" && item.kind !== "skill") return false;
      if (kind === "prompt" && item.kind !== "prompt") return false;
      if (kind === "prompt_system" && (item.kind !== "prompt" || item.promptType !== "system")) return false;
      if (kind === "prompt_user" && (item.kind !== "prompt" || item.promptType !== "user")) return false;
      if (kind === "prompt_composite" && (item.kind !== "prompt" || item.promptType !== "composite")) return false;

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
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden animate-in fade-in-50 duration-150">
      {/* Top Bar inside Chat Area */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0 bg-background/80 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            title="Вернуться к чату"
          >
            <ArrowLeft className="size-4" />
            <span>Назад к чату</span>
          </Button>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Sparkles className="size-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight">Скиллы и Промпты</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 gap-1.5 text-xs font-mono"
            title="Обновить каталог из GitHub"
          >
            <RotateCcw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Обновить</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Закрыть"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Subheader: Tabs, Search, Filters */}
      <div className="px-6 py-3 border-b border-border/40 bg-muted/10 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Tabs */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/40">
            <button
              type="button"
              onClick={() => setTab("registry")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
                tab === "registry"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="size-3.5 text-purple-400" />
              <span>Каталог</span>
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
                "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
                tab === "installed"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              <span>Моя библиотека</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {activeCount}/{installedCount}
              </Badge>
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, триггеру или /команде..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-background border-border/60"
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
        </div>

        {/* Kind Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
          <button
            type="button"
            onClick={() => setKind("all")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap",
              kind === "all" ? "bg-primary text-primary-foreground font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            Все типы
          </button>
          <button
            type="button"
            onClick={() => setKind("skill")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5",
              kind === "skill" ? "bg-purple-600 text-white font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="size-3" />
            Скиллы
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_system")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5",
              kind === "prompt_system" ? "bg-sky-600 text-white font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Terminal className="size-3" />
            Промпт: System (1)
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_user")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5",
              kind === "prompt_user" ? "bg-emerald-600 text-white font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="size-3" />
            Промпт: User (2)
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_composite")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5",
              kind === "prompt_composite" ? "bg-amber-600 text-white font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="size-3" />
            Промпт: 1+2 Composite
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="flex-1 overflow-y-auto p-6 chat-scroll">
        {filteredItems.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Boxes className="size-12 mb-3 opacity-25" />
            <div className="text-base font-medium">Ничего не найдено</div>
            <div className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
              {tab === "installed"
                ? "У вас пока не установлено ни одного скилла или промпта. Перейдите во вкладку «Каталог» для установки в один клик."
                : "Попробуйте изменить поисковый запрос или фильтры."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-7xl mx-auto">
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
                        ? "bg-card border-border shadow-xs hover:border-foreground/30"
                        : "bg-muted/15 border-border/40 opacity-70 hover:opacity-100"
                      : "bg-card/40 border-border/40 hover:border-border hover:bg-card/90"
                  )}
                >
                  <div>
                    {/* Header: Badge & Status */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center flex-wrap gap-1.5">
                        {isSkill && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-medium bg-purple-500/10 text-purple-400 border-purple-500/30 flex items-center gap-1"
                          >
                            <Sparkles className="size-2.5" />
                            Скилл
                          </Badge>
                        )}
                        {isSystemPrompt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-medium bg-sky-500/10 text-sky-400 border-sky-500/30 flex items-center gap-1"
                          >
                            <Terminal className="size-2.5" />
                            Промпт: System (1)
                          </Badge>
                        )}
                        {isUserPrompt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1"
                          >
                            <MessageSquare className="size-2.5" />
                            Промпт: User (2)
                          </Badge>
                        )}
                        {isCompositePrompt && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1"
                          >
                            <Layers className="size-2.5" />
                            Промпт: 1+2
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

                      {/* Status */}
                      {item.isInstalled && (
                        <div className="shrink-0">
                          {item.isEnabled ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                              Включён
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px] text-muted-foreground border-border/50">
                              Отключён
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title & Author */}
                    <h3 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                      <span>{item.name}</span>
                      {item.author && (
                        <span className="text-[11px] text-muted-foreground font-normal">
                          @{item.author}
                        </span>
                      )}
                    </h3>

                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Triggers for skills */}
                    {item.triggers && item.triggers.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1 mt-3">
                        <span className="text-[10px] text-muted-foreground/60">Триггеры:</span>
                        {item.triggers.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted/50 text-muted-foreground border border-border/40"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer Actions */}
                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-border/40">
                    <div className="flex items-center gap-1">
                      {item.rawContent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPreviewItem({
                              title: item.name,
                              typeStr: isSkill ? "Скилл" : item.promptType ? `Промпт: ${item.promptType}` : "Промпт",
                              content: item.rawContent || "",
                            })
                          }
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        >
                          <Eye className="size-3" />
                          <span>Просмотр</span>
                        </Button>
                      )}

                      {/* If prompt has slash command, can run directly in chat */}
                      {item.slash && onApplyPromptToChat && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onApplyPromptToChat(item.slash!);
                            onClose();
                          }}
                          className="h-7 px-2 text-[11px] text-primary hover:text-primary gap-1"
                          title="Вставить в чат и запустить"
                        >
                          <Play className="size-2.5 fill-current" />
                          <span>В чат</span>
                        </Button>
                      )}
                    </div>

                    {/* Install / Toggle / Delete */}
                    <div className="flex items-center gap-1.5">
                      {item.isInstalled ? (
                        <>
                          <Button
                            variant={item.isEnabled ? "default" : "outline"}
                            size="sm"
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleToggle(item.kind, item.id, item.isEnabled)}
                            className="h-7 px-2.5 text-xs gap-1 font-medium"
                            title={item.isEnabled ? "Отключить" : "Включить"}
                          >
                            <Power className="size-3" />
                            <span>{item.isEnabled ? "Вкл" : "Выкл"}</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={Boolean(actionLoading)}
                            onClick={() => handleUninstall(item.kind, item.id)}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Удалить"
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
                          <span>Установить</span>
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

      {/* Preview Dialog */}
      {previewItem && (
        <Dialog open={Boolean(previewItem)} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="max-w-2xl bg-background border-border max-h-[75vh] flex flex-col p-6">
            <DialogHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {previewItem.typeStr}
                </Badge>
                <DialogTitle className="text-base font-semibold">
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
    </div>
  );
}
