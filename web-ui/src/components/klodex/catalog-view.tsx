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
    <div className="flex flex-col flex-1 h-full min-h-0 bg-zinc-950 text-zinc-100 overflow-hidden animate-in fade-in-50 duration-150">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-800/80 shrink-0 bg-zinc-950/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 gap-1.5 px-2.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
            title="Вернуться к чату"
          >
            <ArrowLeft className="size-4" />
            <span>Назад к чату</span>
          </Button>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
              <Bot className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Каталог скиллов и промптов</h2>
              <div className="text-[11px] text-zinc-500 font-mono">
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
            className="h-8 gap-1.5 text-xs font-mono bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-850"
            title="Обновить каталог из репозитория"
          >
            <RotateCcw className={cn("size-3.5", loading && "animate-spin")} />
            <span>Обновить</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
            title="Закрыть"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Subheader: Tabs, Search & Category Filters (Monochrome Dark-Tech) */}
      <div className="px-6 py-3 border-b border-zinc-800/60 bg-zinc-900/30 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Segmented Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => setTab("registry")}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                tab === "registry"
                  ? "bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700/60 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Sparkles className="size-3.5 text-zinc-400" />
              <span>Каталог</span>
              {catalog && (
                <span className="h-4 px-1 text-[10px] font-mono rounded bg-zinc-950 text-zinc-400 border border-zinc-800 flex items-center justify-center">
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
                  ? "bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700/60 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <CheckCircle2 className="size-3.5 text-zinc-400" />
              <span>Моя библиотека</span>
              <span className="h-4 px-1 text-[10px] font-mono rounded bg-zinc-950 text-zinc-400 border border-zinc-800 flex items-center justify-center">
                {activeCount}/{installedCount}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Поиск по названию, триггеру или /команде..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-zinc-900/90 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-zinc-700"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
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
                ? "bg-zinc-200 text-zinc-950 font-semibold"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-zinc-800/80"
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
                ? "bg-zinc-200 text-zinc-950 font-semibold"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-zinc-800/80"
            )}
          >
            <Sparkles className="size-3 text-zinc-400" />
            <span>Скиллы</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_system")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_system"
                ? "bg-zinc-200 text-zinc-950 font-semibold"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-zinc-800/80"
            )}
          >
            <Terminal className="size-3 text-zinc-400" />
            <span>Промпт: System</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_user")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_user"
                ? "bg-zinc-200 text-zinc-950 font-semibold"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-zinc-800/80"
            )}
          >
            <MessageSquare className="size-3 text-zinc-400" />
            <span>Промпт: User</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("prompt_composite")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
              kind === "prompt_composite"
                ? "bg-zinc-200 text-zinc-950 font-semibold"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-zinc-800/80"
            )}
          >
            <Layers className="size-3 text-zinc-400" />
            <span>Промпт: Composite</span>
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      <div className="flex-1 overflow-y-auto p-6 chat-scroll">
        {filteredItems.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
            <Bot className="size-12 mb-3 opacity-20" />
            <div className="text-base font-medium text-zinc-300">Ничего не найдено</div>
            <div className="text-xs text-zinc-500 mt-1 max-w-sm leading-relaxed">
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
                    "group relative p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between",
                    item.isInstalled
                      ? item.isEnabled
                        ? "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/90 shadow-xs"
                        : "bg-zinc-950/60 border-zinc-850 opacity-70 hover:opacity-100"
                      : "bg-zinc-950/40 border-zinc-850 hover:border-zinc-800 hover:bg-zinc-900/40"
                  )}
                >
                  <div>
                    {/* Header: Badge & Status */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-5 px-1.5 text-[10px] font-mono font-medium bg-zinc-900 text-zinc-300 border-zinc-800 flex items-center gap-1"
                        >
                          <MetaIcon className="size-2.5 text-zinc-400" />
                          <span>{meta.label}</span>
                        </Badge>

                        {item.slash && (
                          <span className="h-5 px-1.5 text-[10px] font-mono font-medium text-zinc-200 bg-zinc-950 border border-zinc-800 rounded flex items-center">
                            {item.slash}
                          </span>
                        )}

                        {item.version && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            v{item.version}
                          </span>
                        )}
                      </div>

                      {/* Status indicator */}
                      {item.isInstalled && (
                        <div className="shrink-0">
                          {item.isEnabled ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5 rounded">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <span>активен</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                              <span className="size-1.5 rounded-full bg-zinc-600" />
                              <span>выкл</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Title & Author */}
                    <h3 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5 group-hover:text-white transition-colors">
                      <span>{item.name}</span>
                      {item.author && (
                        <span className="text-[11px] text-zinc-500 font-normal font-mono">
                          @{item.author}
                        </span>
                      )}
                    </h3>

                    <p className="text-xs text-zinc-400 mt-1.5 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Triggers for skills */}
                    {item.triggers && item.triggers.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1 mt-3">
                        <span className="text-[10px] text-zinc-500">Триггеры:</span>
                        {item.triggers.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-850"
                          >
                            {t}
                          </span>
                        ))}
                        {item.triggers.length > 4 && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            +{item.triggers.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer Actions */}
                  <div className="flex items-center justify-between pt-3 mt-4 border-t border-zinc-850">
                    <div className="flex items-center gap-1">
                      {/* Full preview */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenPreview(item, "content")}
                        className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 gap-1"
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
                        className="h-7 px-2 text-[11px] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-850 gap-1"
                        title="Спросить у выбранной нейросети про этот скилл"
                      >
                        <Brain className="size-3 text-zinc-400" />
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
                          className="h-7 px-2 text-[11px] text-zinc-200 hover:text-white hover:bg-zinc-850 gap-1"
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
                            className={cn(
                              "h-7 px-2.5 text-xs gap-1 font-medium",
                              item.isEnabled
                                ? "bg-zinc-200 text-zinc-950 hover:bg-white"
                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            )}
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
                            className="h-7 px-2 text-xs text-zinc-500 hover:text-rose-400 hover:bg-rose-950/20"
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
                          className="h-7 px-3 text-xs gap-1.5 font-medium bg-zinc-200 text-zinc-950 hover:bg-white"
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
            className="max-w-4xl w-[94vw] h-[88vh] bg-zinc-950 border border-zinc-800 p-0 flex flex-col overflow-hidden text-zinc-100 shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200 shrink-0">
                  {previewItem.kind === "skill" ? (
                    <Sparkles className="size-4 text-zinc-300" />
                  ) : (
                    <Terminal className="size-4 text-zinc-300" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base font-semibold text-zinc-100 truncate">
                      {previewItem.name}
                    </DialogTitle>

                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono bg-zinc-900 border-zinc-850 text-zinc-300 h-5"
                    >
                      {previewItem.kind === "skill"
                        ? "Скилл"
                        : previewItem.promptType
                        ? `Промпт: ${previewItem.promptType}`
                        : "Промпт"}
                    </Badge>

                    {previewItem.slash && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 font-medium">
                        {previewItem.slash}
                      </span>
                    )}

                    {previewItem.version && (
                      <span className="text-[11px] font-mono text-zinc-500">
                        v{previewItem.version}
                      </span>
                    )}

                    {previewItem.author && (
                      <span className="text-[11px] font-mono text-zinc-500">
                        @{previewItem.author}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-zinc-400 mt-0.5 truncate max-w-xl">
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
                    className="h-8 px-2.5 text-xs gap-1.5 bg-zinc-900 border-zinc-800 text-zinc-200 hover:text-white"
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
                    className={cn(
                      "h-8 px-2.5 text-xs gap-1.5 font-medium",
                      previewItem.isEnabled
                        ? "bg-zinc-200 text-zinc-950 hover:bg-white"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    )}
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
                    className="h-8 px-3 text-xs gap-1.5 font-medium bg-zinc-200 text-zinc-950 hover:bg-white"
                  >
                    <Download className="size-3" />
                    <span>Установить</span>
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPreviewItem(null)}
                  className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Preview Navigation Strip: Content vs Ask AI */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
              <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setPreviewTab("content")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer",
                    previewTab === "content"
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-750 shadow-xs font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <FileText className="size-3.5 text-zinc-400" />
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
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-750 shadow-xs font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Brain className="size-3.5 text-zinc-300" />
                  <span>Разбор от ИИ</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                    {currentExplainingModel.model}
                  </span>
                </button>
              </div>

              {/* View options in Content tab */}
              {previewTab === "content" ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-zinc-900 p-0.5 rounded-md border border-zinc-850">
                    <button
                      type="button"
                      onClick={() => setContentViewMode("rendered")}
                      className={cn(
                        "px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer",
                        contentViewMode === "rendered"
                          ? "bg-zinc-800 text-zinc-100 font-medium"
                          : "text-zinc-400 hover:text-zinc-200"
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
                          ? "bg-zinc-800 text-zinc-100 font-medium"
                          : "text-zinc-400 hover:text-zinc-200"
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
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 gap-1.5"
                      title="Скопировать содержимое"
                    >
                      {copiedContent ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
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
                      className="h-7 px-2.5 text-xs text-rose-400 border-rose-900/50 bg-rose-950/20 hover:bg-rose-950/40 gap-1.5"
                    >
                      <Square className="size-3 fill-current" />
                      <span>Остановить</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startAiExplanation(previewItem, true)}
                      className="h-7 px-2.5 text-xs text-zinc-300 border-zinc-800 bg-zinc-900 hover:bg-zinc-850 gap-1.5"
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
                      className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 gap-1.5"
                      title="Скопировать разбор"
                    >
                      {copiedAi ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      <span>{copiedAi ? "Скопировано" : "Копировать"}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 chat-scroll bg-zinc-950">
              {previewTab === "content" ? (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {/* Metadata strip */}
                  <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-850 space-y-2 text-xs">
                    {previewItem.path && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-500 font-mono shrink-0">Файл:</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <code className="text-zinc-300 font-mono text-[11px] truncate bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-850">
                            {previewItem.path}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(previewItem.path || "", "path")}
                            className="text-zinc-500 hover:text-zinc-300 p-1"
                            title="Скопировать путь"
                          >
                            {copiedPath ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {previewItem.triggers && previewItem.triggers.length > 0 && (
                      <div className="flex items-start gap-2 pt-1 border-t border-zinc-850/60">
                        <span className="text-zinc-500 font-mono shrink-0 mt-0.5">Триггеры:</span>
                        <div className="flex items-center flex-wrap gap-1">
                          {previewItem.triggers.map((t) => (
                            <span
                              key={t}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800"
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
                    <div className="p-6 rounded-lg bg-zinc-900/30 border border-zinc-850 text-zinc-200 text-sm leading-relaxed prose prose-invert max-w-none">
                      <Streamdown plugins={streamdownPlugins}>
                        {previewItem.rawContent || "*Инструкции отсутствуют или пусты.*"}
                      </Streamdown>
                    </div>
                  ) : (
                    <pre className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-850 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto selection:bg-zinc-800">
                      {previewItem.rawContent || "Пусто"}
                    </pre>
                  )}
                </div>
              ) : (
                /* AI Explanation Tab */
                <div className="space-y-4 max-w-4xl mx-auto">
                  {/* Status header banner */}
                  <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-850 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-md bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                        <Bot className="size-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          <span>Разбор сформирован моделью</span>
                          <span className="font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-[11px]">
                            {currentExplainingModel.provider}/{currentExplainingModel.model}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {aiLoading
                            ? "Нейросеть генерирует структурированный анализ скилла..."
                            : "Анализ назначения, логики работы, реальных сценариев и ограничений."}
                        </div>
                      </div>
                    </div>

                    {aiLoading && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                        <Loader2 className="size-3.5 animate-spin text-zinc-300" />
                        <span>генерация...</span>
                      </div>
                    )}
                  </div>

                  {/* Error state */}
                  {aiError && (
                    <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-900/40 text-rose-300 text-xs flex items-start gap-2.5">
                      <span className="font-semibold shrink-0">Ошибка разбора:</span>
                      <div className="flex-1">{aiError}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startAiExplanation(previewItem, true)}
                        className="h-6 px-2 text-[11px] bg-rose-950/40 border-rose-800 text-rose-200 hover:bg-rose-900/50"
                      >
                        Повторить
                      </Button>
                    </div>
                  )}

                  {/* AI Response or Initial empty state */}
                  {aiExplanations[previewItem.uniqueId] ? (
                    <div className="p-6 rounded-lg bg-zinc-900/40 border border-zinc-850 text-zinc-200 text-sm leading-relaxed prose prose-invert max-w-none">
                      <Streamdown plugins={streamdownPlugins}>
                        {aiExplanations[previewItem.uniqueId]}
                      </Streamdown>
                    </div>
                  ) : !aiLoading && !aiError ? (
                    <div className="p-12 text-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/20 flex flex-col items-center justify-center">
                      <Brain className="size-10 text-zinc-600 mb-3" />
                      <div className="text-sm font-semibold text-zinc-300">
                        Спросить у модели о скилле
                      </div>
                      <p className="text-xs text-zinc-500 max-w-md mt-1.5 leading-relaxed">
                        Выбранная модель ({currentExplainingModel.model}) прочитает инструкции скилла
                        и составит краткую выжимку: суть, триггеры, боевые кейсы и ограничения.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => startAiExplanation(previewItem, true)}
                        className="mt-4 gap-1.5 text-xs bg-zinc-200 text-zinc-950 hover:bg-white font-medium"
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
