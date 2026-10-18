import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  Play,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  Square,
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
  explainSkillStream,
  type CatalogResponse,
  type PromptType,
  type KlodexProvider,
} from "@/lib/api";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

const streamdownPlugins = { cjk, code, math, mermaid };

export interface CatalogViewProps {
  projectDir?: string;
  selectedModel?: { provider: string; model: string } | null;
  modelsCatalog?: KlodexProvider[];
  onClose: () => void;
  onApplyPromptToChat?: (slash: string) => void;
}

type MainTab = "registry" | "installed";
type KindFilter = "all" | "skill" | "prompt_system" | "prompt_user" | "prompt_composite";
type PreviewTab = "content" | "ai";
type ContentViewMode = "rendered" | "raw";

export type UnifiedItem = {
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

export function CatalogView({
  projectDir,
  selectedModel,
  modelsCatalog,
  onClose,
  onApplyPromptToChat,
}: CatalogViewProps) {
  const [tab, setTab] = useState<MainTab>("registry");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  // Preview & AI inspection state
  const [previewItem, setPreviewItem] = useState<UnifiedItem | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("content");
  const [contentViewMode, setContentViewMode] = useState<ContentViewMode>("rendered");
  const [copiedContent, setCopiedContent] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);

  // Cached explanations per item uniqueId
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Active model selection for AI explanations
  const activeModel = useMemo(() => {
    if (selectedModel?.provider && selectedModel?.model) {
      return selectedModel;
    }
    const saved = localStorage.getItem("klodex_model");
    if (saved && saved.includes("/")) {
      const [provider, ...rest] = saved.split("/");
      return { provider, model: rest.join("/") };
    }
    return { provider: "deepai", model: "deepseek-v3.2" };
  }, [selectedModel]);

  const [aiModelOverride, setAiModelOverride] = useState<{ provider: string; model: string } | null>(null);
  const currentExplainingModel = aiModelOverride || activeModel;

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

  // Clean up streaming on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
          [p.systemContent ? `## System Prompt\n${p.systemContent}` : "", p.userContent ? `## User Prompt\n${p.userContent}` : ""]
            .filter(Boolean)
            .join("\n\n"),
      });
    }

    return list;
  }, [catalog]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (tab === "installed" && !item.isInstalled) return false;

      if (kind === "skill" && item.kind !== "skill") return false;
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
  }, [allItems, tab, kind, search]);

  const installedCount = useMemo(() => allItems.filter((i) => i.isInstalled).length, [allItems]);
  const activeCount = useMemo(() => allItems.filter((i) => i.isInstalled && i.isEnabled).length, [allItems]);

  // Trigger streaming AI explanation for an item
  const startAiExplanation = async (item: UnifiedItem, force = false) => {
    if (!force && aiExplanations[item.uniqueId]) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAiLoading(true);
    setAiError(null);
    setAiExplanations((prev) => ({ ...prev, [item.uniqueId]: "" }));

    try {
      const stream = explainSkillStream(
        {
          name: item.name,
          kind: item.kind,
          promptType: item.promptType,
          triggers: item.triggers,
          description: item.description,
          content: item.rawContent,
          provider: currentExplainingModel.provider,
          model: currentExplainingModel.model,
        },
        controller.signal
      );

      for await (const evt of stream) {
        if (evt.t === "delta") {
          setAiExplanations((prev) => ({
            ...prev,
            [item.uniqueId]: (prev[item.uniqueId] || "") + evt.text,
          }));
        } else if (evt.t === "finish") {
          break;
        } else if (evt.t === "error") {
          setAiError(evt.error);
          break;
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setAiError(err?.message || "Сбой при генерации разбора нейросетью");
      }
    } finally {
      setAiLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stopAiExplanation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setAiLoading(false);
    }
  };

  const handleOpenPreview = (item: UnifiedItem, initialTab: PreviewTab = "content") => {
    setPreviewItem(item);
    setPreviewTab(initialTab);
    setContentViewMode("rendered");
    setCopiedContent(false);
    setCopiedPath(false);
    setCopiedAi(false);

    if (initialTab === "ai") {
      void startAiExplanation(item);
    }
  };

  const handleCopy = (text: string, type: "content" | "path" | "ai") => {
    navigator.clipboard.writeText(text);
    if (type === "content") {
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } else if (type === "path") {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } else if (type === "ai") {
      setCopiedAi(true);
      setTimeout(() => setCopiedAi(false), 2000);
    }
  };

  // Helper labels & icons
  const getItemTypeMeta = (item: UnifiedItem) => {
    if (item.kind === "skill") {
      return {
        label: "Скилл",
        icon: Sparkles,
      };
    }
    if (item.promptType === "system") {
      return {
        label: "System Prompt",
        icon: Terminal,
      };
    }
    if (item.promptType === "user") {
      return {
        label: "User Prompt",
        icon: MessageSquare,
      };
    }
    return {
      label: "Composite Prompt",
      icon: Layers,
    };
  };

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background text-foreground overflow-hidden animate-in fade-in-50 duration-150">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0 bg-background/80 backdrop-blur-md">
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

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground">
              <Bot className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Каталог скиллов и промптов</h2>
              <div className="text-[11px] text-muted-foreground font-mono">
                {activeCount} активно / {installedCount} установлено
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 gap-1.5 text-xs font-mono"
            title="Обновить каталог из репозитория"
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

      {/* Subheader: Tabs, Search & Filters (Clean Adaptive Theme) */}
      <div className="px-6 py-3 border-b border-border/60 bg-muted/20 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Segmented Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setTab("registry")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                tab === "registry"
                  ? "bg-background text-foreground shadow-xs border border-border/80 font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="size-3.5 text-muted-foreground" />
              <span>Каталог</span>
              {catalog && (
                <span className="h-4 px-1 text-[10px] font-mono rounded bg-muted text-muted-foreground border border-border/60 flex items-center justify-center">
                  {allItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab("installed")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                tab === "installed"
                  ? "bg-background text-foreground shadow-xs border border-border/80 font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
              <span>Моя библиотека</span>
              <span className="h-4 px-1 text-[10px] font-mono rounded bg-muted text-muted-foreground border border-border/60 flex items-center justify-center">
                {activeCount}/{installedCount}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, триггеру или /команде..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
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
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-0.5">
          <button
            type="button"
            onClick={() => setKind("all")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap cursor-pointer",
              kind === "all"
                ? "bg-primary text-primary-foreground font-medium shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60"
            )}
          >
            Все типы
          </button>
          <button
            type="button"
            onClick={() => setKind("skill")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "skill"
                ? "bg-primary text-primary-foreground font-medium shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60"
            )}
          >
            <Sparkles className="size-3 text-muted-foreground" />
            <span>Скиллы</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_system")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_system"
                ? "bg-primary text-primary-foreground font-medium shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60"
            )}
          >
            <Terminal className="size-3 text-muted-foreground" />
            <span>Промпт: System</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_user")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_user"
                ? "bg-primary text-primary-foreground font-medium shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60"
            )}
          >
            <MessageSquare className="size-3 text-muted-foreground" />
            <span>Промпт: User</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_composite")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_composite"
                ? "bg-primary text-primary-foreground font-medium shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/60"
            )}
          >
            <Layers className="size-3 text-muted-foreground" />
            <span>Промпт: Composite</span>
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="flex-1 overflow-y-auto p-6 chat-scroll bg-background">
        {filteredItems.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Bot className="size-12 mb-3 opacity-20" />
            <div className="text-base font-medium text-foreground">Ничего не найдено</div>
            <div className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
              {tab === "installed"
                ? "В библиотеке пока нет установленных компонентов. Выберите нужные скиллы или промпты во вкладке «Каталог»."
                : "Попробуйте изменить поисковый запрос или фильтры."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-7xl mx-auto">
            {filteredItems.map((item) => {
              const meta = getItemTypeMeta(item);
              const MetaIcon = meta.icon;

              return (
                <div
                  key={item.uniqueId}
                  className={cn(
                    "group relative p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between shadow-xs",
                    item.isInstalled
                      ? item.isEnabled
                        ? "bg-card border-border hover:border-foreground/30 hover:bg-accent/30"
                        : "bg-muted/30 border-border/60 opacity-70 hover:opacity-100"
                      : "bg-card border-border/60 hover:border-border hover:bg-accent/20"
                  )}
                >
                  <div>
                    {/* Header: Badge & Status */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px] font-mono font-medium bg-muted/70 text-foreground border-border flex items-center gap-1"
                        >
                          <MetaIcon className="size-2.5 text-muted-foreground" />
                          <span>{meta.label}</span>
                        </Badge>

                        {item.slash && (
                          <span className="h-5 px-1.5 text-[10px] font-mono font-medium text-foreground bg-muted border border-border rounded flex items-center">
                            {item.slash}
                          </span>
                        )}

                        {item.version && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            v{item.version}
                          </span>
                        )}
                      </div>

                      {/* Status indicator */}
                      {item.isInstalled && (
                        <div className="shrink-0">
                          {item.isEnabled ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <span>активен</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded">
                              <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                              <span>выкл</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title & Author */}
                    <h3 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1.5 group-hover:text-primary transition-colors">
                      <span>{item.name}</span>
                      {item.author && (
                        <span className="text-[11px] text-muted-foreground font-normal font-mono">
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
                        <span className="text-[10px] text-muted-foreground/70">Триггеры:</span>
                        {item.triggers.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60"
                          >
                            {t}
                          </span>
                        ))}
                        {item.triggers.length > 4 && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            +{item.triggers.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer Actions */}
                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-border/60">
                    <div className="flex items-center gap-1">
                      {/* Full preview */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPreview(item, "content")}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        title="Открыть полноценный предпросмотр"
                      >
                        <Eye className="size-3" />
                        <span>Просмотр</span>
                      </Button>

                      {/* Quick AI explanation button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPreview(item, "ai")}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        title="Спросить у выбранной нейросети про этот скилл"
                      >
                        <Brain className="size-3 text-muted-foreground" />
                        <span>Спросить у ИИ</span>
                      </Button>

                      {/* Run slash in chat */}
                      {item.slash && onApplyPromptToChat && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onApplyPromptToChat(item.slash!);
                            onClose();
                          }}
                          className="h-7 px-2 text-[11px] text-primary hover:text-primary gap-1"
                          title="Вставить команду в чат"
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
                            title={item.isEnabled ? "Отключить компонент" : "Включить компонент"}
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
                            title="Удалить из системы"
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

      {/* Full-Fledged Preview & AI Explanation Dialog */}
      {previewItem && (
        <Dialog open={Boolean(previewItem)} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent
            showCloseButton={false}
            className="max-w-4xl w-[94vw] h-[88vh] bg-background border border-border p-0 flex flex-col overflow-hidden text-foreground shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                  {previewItem.kind === "skill" ? (
                    <Sparkles className="size-4 text-muted-foreground" />
                  ) : (
                    <Terminal className="size-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base font-semibold text-foreground truncate">
                      {previewItem.name}
                    </DialogTitle>

                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono bg-muted/60 border-border text-foreground h-5"
                    >
                      {previewItem.kind === "skill"
                        ? "Скилл"
                        : previewItem.promptType
                        ? `Промпт: ${previewItem.promptType}`
                        : "Промпт"}
                    </Badge>

                    {previewItem.slash && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-medium">
                        {previewItem.slash}
                      </span>
                    )}

                    {previewItem.version && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        v{previewItem.version}
                      </span>
                    )}

                    {previewItem.author && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        @{previewItem.author}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">
                    {previewItem.description}
                  </div>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {previewItem.slash && onApplyPromptToChat && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onApplyPromptToChat(previewItem.slash!);
                      setPreviewItem(null);
                      onClose();
                    }}
                    className="h-8 px-2.5 text-xs gap-1.5"
                  >
                    <Play className="size-3 fill-current" />
                    <span>Вставить в чат</span>
                  </Button>
                )}

                {previewItem.isInstalled ? (
                  <Button
                    variant={previewItem.isEnabled ? "default" : "outline"}
                    size="sm"
                    disabled={Boolean(actionLoading)}
                    onClick={() => handleToggle(previewItem.kind, previewItem.id, previewItem.isEnabled)}
                    className="h-8 px-2.5 text-xs gap-1.5 font-medium"
                  >
                    <Power className="size-3" />
                    <span>{previewItem.isEnabled ? "Активен" : "Отключен"}</span>
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={Boolean(actionLoading) || !previewItem.path}
                    onClick={() => handleInstall(previewItem.kind, previewItem.id, previewItem.path!)}
                    className="h-8 px-3 text-xs gap-1.5 font-medium"
                  >
                    <Download className="size-3" />
                    <span>Установить</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPreviewItem(null)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Preview Navigation Strip: Content vs Ask AI */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setPreviewTab("content")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                    previewTab === "content"
                      ? "bg-background text-foreground border border-border/80 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span>Содержимое и инструкции</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewTab("ai");
                    if (!aiExplanations[previewItem.uniqueId]) {
                      void startAiExplanation(previewItem);
                    }
                  }}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                    previewTab === "ai"
                      ? "bg-background text-foreground border border-border/80 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Brain className="size-3.5 text-muted-foreground" />
                  <span>Разбор от ИИ</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border/60">
                    {currentExplainingModel.model}
                  </span>
                </button>
              </div>

              {/* View options in Content tab */}
              {previewTab === "content" ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-muted/60 p-0.5 rounded-md border border-border/60">
                    <button
                      type="button"
                      onClick={() => setContentViewMode("rendered")}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer",
                        contentViewMode === "rendered"
                          ? "bg-background text-foreground font-medium shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Рендер
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentViewMode("raw")}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer",
                        contentViewMode === "raw"
                          ? "bg-background text-foreground font-medium shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Исходник
                    </button>
                  </div>

                  {previewItem.rawContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(previewItem.rawContent || "", "content")}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                      title="Скопировать содержимое"
                    >
                      {copiedContent ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
                      <span>{copiedContent ? "Скопировано" : "Копировать"}</span>
                    </Button>
                  )}
                </div>
              ) : (
                /* Actions in AI tab */
                <div className="flex items-center gap-2">
                  {aiLoading ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={stopAiExplanation}
                      className="h-7 px-2.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 gap-1.5"
                    >
                      <Square className="size-3 fill-current" />
                      <span>Остановить</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startAiExplanation(previewItem, true)}
                      className="h-7 px-2.5 text-xs text-foreground gap-1.5"
                      title="Перегенерировать объяснение"
                    >
                      <RotateCcw className="size-3" />
                      <span>Перегенерировать</span>
                    </Button>
                  )}

                  {aiExplanations[previewItem.uniqueId] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(aiExplanations[previewItem.uniqueId] || "", "ai")}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                      title="Скопировать разбор"
                    >
                      {copiedAi ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
                      <span>{copiedAi ? "Скопировано" : "Копировать"}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 chat-scroll bg-background">
              {previewTab === "content" ? (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {/* Metadata strip */}
                  <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-2 text-xs">
                    {previewItem.path && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-mono shrink-0">Файл:</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <code className="text-foreground font-mono text-[11px] truncate bg-background px-1.5 py-0.5 rounded border border-border">
                            {previewItem.path}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(previewItem.path || "", "path")}
                            className="text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                            title="Скопировать путь"
                          >
                            {copiedPath ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {previewItem.triggers && previewItem.triggers.length > 0 && (
                      <div className="flex items-start gap-2 pt-1 border-t border-border/60">
                        <span className="text-muted-foreground font-mono shrink-0 mt-0.5">Триггеры:</span>
                        <div className="flex items-center flex-wrap gap-1">
                          {previewItem.triggers.map((t) => (
                            <span
                              key={t}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-background text-foreground border border-border"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content viewer */}
                  {contentViewMode === "rendered" ? (
                    <div className="p-6 rounded-lg bg-card border border-border text-foreground text-sm leading-relaxed">
                      <Streamdown plugins={streamdownPlugins}>
                        {previewItem.rawContent || "*Инструкции отсутствуют или пусты.*"}
                      </Streamdown>
                    </div>
                  ) : (
                    <pre className="p-4 rounded-lg bg-muted/30 border border-border font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed overflow-x-auto">
                      {previewItem.rawContent || "Пусто"}
                    </pre>
                  )}
                </div>
              ) : (
                /* AI Explanation Tab */
                <div className="space-y-4 max-w-4xl mx-auto">
                  {/* Status header banner */}
                  <div className="p-3.5 rounded-lg bg-muted/40 border border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-md bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                        <Bot className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span>Разбор сформирован моделью</span>
                          <span className="font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border text-[11px]">
                            {currentExplainingModel.provider}/{currentExplainingModel.model}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {aiLoading
                            ? "Нейросеть генерирует структурированный анализ скилла..."
                            : "Анализ назначения, логики работы, реальных сценариев и ограничений."}
                        </div>
                      </div>
                    </div>

                    {aiLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <Loader2 className="size-3.5 animate-spin text-foreground" />
                        <span>генерация...</span>
                      </div>
                    )}
                  </div>

                  {/* Error state */}
                  {aiError && (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2.5">
                      <span className="font-semibold shrink-0">Ошибка разбора:</span>
                      <div className="flex-1">{aiError}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startAiExplanation(previewItem, true)}
                        className="h-6 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        Повторить
                      </Button>
                    </div>
                  )}

                  {/* AI Response or Initial empty state */}
                  {aiExplanations[previewItem.uniqueId] ? (
                    <div className="p-6 rounded-lg bg-card border border-border text-foreground text-sm leading-relaxed">
                      <Streamdown plugins={streamdownPlugins}>
                        {aiExplanations[previewItem.uniqueId]}
                      </Streamdown>
                    </div>
                  ) : !aiLoading && !aiError ? (
                    <div className="p-12 text-center rounded-lg border border-dashed border-border bg-muted/10 flex flex-col items-center justify-center">
                      <Brain className="size-10 text-muted-foreground/60 mb-3" />
                      <div className="text-sm font-semibold text-foreground">
                        Спросить у модели о скилле
                      </div>
                      <p className="text-xs text-muted-foreground max-w-md mt-1.5 leading-relaxed">
                        Выбранная модель ({currentExplainingModel.model}) прочитает инструкции скилла
                        и составит краткую выжимку: суть, триггеры, боевые кейсы и ограничения.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => startAiExplanation(previewItem, true)}
                        className="mt-4 gap-1.5 text-xs font-medium"
                      >
                        <Sparkles className="size-3.5" />
                        <span>Запустить разбор нейросетью</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
