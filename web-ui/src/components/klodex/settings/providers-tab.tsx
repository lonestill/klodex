import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { api, modelKey, type KlodexProvider, type ProviderSort } from "@/lib/api";
import { CustomProviderDialog } from "./custom-provider-dialog";

interface ProvidersTabProps {
  catalog: KlodexProvider[];
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  search: string;
  setSearch: (s: string) => void;
  sortMode: ProviderSort;
  setSortMode: (s: ProviderSort) => void;
  onlyFree: boolean;
  setOnlyFree: (v: boolean) => void;
  onGoToKeys: (providerName: string) => void;
  onCatalogRefresh?: () => Promise<void> | void;
}

export function ProvidersTab({
  catalog,
  selected,
  onSelectedChange,
  search,
  setSearch,
  sortMode,
  setSortMode,
  onlyFree,
  setOnlyFree,
  onGoToKeys,
  onCatalogRefresh,
}: ProvidersTabProps) {
  const { t, lang } = useI18n();

  // Visibility state
  const [disabledProviders, setDisabledProviders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("klodex_disabled_providers") || "[]");
    } catch {
      return [];
    }
  });

  const [disabledModels, setDisabledModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("klodex_disabled_models") || "[]");
    } catch {
      return [];
    }
  });

  // Accordion state for expanded provider models
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  // Custom Provider Dialog state
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<KlodexProvider | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .settings()
      .then((s) => {
        if (Array.isArray(s.disabledProviders)) {
          setDisabledProviders(s.disabledProviders);
          localStorage.setItem("klodex_disabled_providers", JSON.stringify(s.disabledProviders));
        }
        if (Array.isArray(s.disabledModels)) {
          setDisabledModels(s.disabledModels);
          localStorage.setItem("klodex_disabled_models", JSON.stringify(s.disabledModels));
        }
      })
      .catch(() => {});

    const openDialogHandler = () => {
      setEditingProvider(null);
      setCustomDialogOpen(true);
    };
    window.addEventListener("klodex:openCustomProviderDialog", openDialogHandler);
    return () => window.removeEventListener("klodex:openCustomProviderDialog", openDialogHandler);
  }, []);

  const saveDisabledLists = (providers: string[], modelsList: string[]) => {
    localStorage.setItem("klodex_disabled_providers", JSON.stringify(providers));
    localStorage.setItem("klodex_disabled_models", JSON.stringify(modelsList));
    window.dispatchEvent(new CustomEvent("klodex:visibilityChanged"));
    void api.saveSettings({ disabledProviders: providers, disabledModels: modelsList }).catch(() => {});
  };

  const toggleProviderVisibility = (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = disabledProviders.includes(providerId)
      ? disabledProviders.filter((id) => id !== providerId)
      : [...disabledProviders, providerId];
    setDisabledProviders(next);
    saveDisabledLists(next, disabledModels);
  };

  const toggleModelVisibility = (providerId: string, modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullKey = `${providerId}/${modelId}`;
    const isHidden = disabledModels.includes(fullKey) || disabledModels.includes(modelId);
    let next: string[];
    if (isHidden) {
      next = disabledModels.filter((k) => k !== fullKey && k !== modelId);
    } else {
      next = [...disabledModels, fullKey];
    }
    setDisabledModels(next);
    saveDisabledLists(disabledProviders, next);
  };

  const toggleAllModelsForProvider = (providerId: string, enableAll: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const prov = catalog.find((p) => p.id === providerId);
    if (!prov) return;

    let next = [...disabledModels];
    if (enableAll) {
      // Unhide all models of this provider
      next = next.filter((k) => {
        if (k.startsWith(`${providerId}/`)) return false;
        if (prov.models.some((m) => m.id === k)) return false;
        return true;
      });
    } else {
      // Hide all models of this provider
      for (const m of prov.models) {
        const fullKey = `${providerId}/${m.id}`;
        if (!next.includes(fullKey)) next.push(fullKey);
      }
    }
    setDisabledModels(next);
    saveDisabledLists(disabledProviders, next);
  };

  const toggleExpanded = (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProviders((prev) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  const handleDeleteCustomProvider = async (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      lang === "ru"
        ? `Удалить кастомный провайдер "${providerId}"?`
        : `Delete custom provider "${providerId}"?`,
    );
    if (!confirmed) return;

    setDeletingId(providerId);
    try {
      await api.deleteCustomProvider(providerId);
      if (onCatalogRefresh) await onCatalogRefresh();
    } catch (err: any) {
      alert(err?.message || "Failed to delete provider");
    } finally {
      setDeletingId(null);
    }
  };

  const currentProvider = useMemo(
    () => catalog.find((p) => p.id === selected?.provider),
    [catalog, selected],
  );

  const filteredProviders = useMemo(() => {
    let list = catalog;
    if (onlyFree) {
      list = list.filter((p) => {
        if (p.category === "free_keyless") return true;
        return p.models.some((m) => m.free && !m.deprecated);
      });
    }

    if (sortMode === "alpha") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "models") {
      list = [...list].sort((a, b) => b.models.length - a.models.length);
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.models.some((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [catalog, search, onlyFree, sortMode]);

  const selectProvider = (p: KlodexProvider) => {
    const isReady = p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local";
    if (!isReady) {
      onGoToKeys(p.name);
      return;
    }
    let model = p.models[0]?.id ?? "";
    if (onlyFree && Array.isArray(p.models)) {
      const freeModel = p.models.find((m) => m.free && !m.deprecated);
      if (freeModel) model = freeModel.id;
    }
    onSelectedChange({ provider: p.id, model });
    localStorage.setItem("klodex_model", modelKey(p.id, model));
    void api.saveSettings({ defaultProvider: p.id, defaultModel: model }).catch(() => {});
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 gap-4">
      {/* Active Provider & Default Model Card */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-4 shadow-xs backdrop-blur-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("settings.currentProvider")}</span>
            <span className="font-display text-sm font-semibold text-foreground">
              {currentProvider?.name ?? t("settings.notSelected")}
            </span>
            {currentProvider?.custom && (
              <Badge
                variant="outline"
                className="h-4.5 border-primary/40 bg-primary/10 px-1.5 font-mono text-[9px] text-primary"
              >
                {lang === "ru" ? "кастомный" : "custom"}
              </Badge>
            )}
            {currentProvider?.id === "antigravity" && (
              <Badge
                variant="outline"
                className="h-4.5 border-violet-500/30 bg-violet-500/10 px-1.5 font-mono text-[9px] text-violet-400"
                title={t("chat.antigravityTools")}
              >
                antigravity tools
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {t("settings.modelsCount", { count: currentProvider?.models.length ?? 0 })}
          </Badge>
        </div>

        {currentProvider && currentProvider.models.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-2.5">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t("settings.defaultModel")}
            </span>
            <Select
              value={selected?.model ?? currentProvider.models[0]?.id ?? ""}
              onValueChange={(m) => {
                onSelectedChange({ provider: currentProvider.id, model: m });
                localStorage.setItem("klodex_model", modelKey(currentProvider.id, m));
                void api.saveSettings({ defaultProvider: currentProvider.id, defaultModel: m }).catch(() => {});
              }}
            >
              <SelectTrigger className="h-8 max-w-[360px] flex-1 bg-background/80 font-mono text-xs">
                <SelectValue placeholder={t("settings.chooseModel")} />
              </SelectTrigger>
              <SelectContent align="end" className="chat-scroll max-h-[300px]">
                {currentProvider.models
                  .filter((m) => !onlyFree || (m.free && !m.deprecated))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                      <span className="truncate">{m.name || m.id}</span>
                      {m.free && (
                        <Badge variant="outline" className="ml-1.5 h-3.5 border-emerald-500/30 px-1 text-[8px] text-emerald-500">
                          free
                        </Badge>
                      )}
                      {m.contextWindow && (
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          [{Math.round(m.contextWindow / 1000)}k]
                        </span>
                      )}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Control Bar: Search, Sort Mode, Free Filter */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder={t("settings.searchProvider")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs bg-card/40 border-border/60"
          />
        </div>

        {/* Sort Mode */}
        <Select
          value={sortMode}
          onValueChange={(val) => {
            const sm = val as ProviderSort;
            setSortMode(sm);
            localStorage.setItem("klodex_providerSort", sm);
            void api.saveSettings({ providerSort: sm }).catch(() => {});
          }}
        >
          <SelectTrigger className="h-9 w-[145px] shrink-0 gap-1.5 border-border/60 bg-card/40 px-2.5 text-xs" title={t("settings.sortMode")}>
            <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder={t("settings.sortMode")} />
          </SelectTrigger>
          <SelectContent align="end" className="text-xs">
            <SelectItem value="category" className="text-xs">{t("settings.sortCategory")}</SelectItem>
            <SelectItem value="alpha" className="text-xs">{t("settings.sortAlpha")}</SelectItem>
            <SelectItem value="models" className="text-xs">{t("settings.sortModels")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Only Free Toggle */}
        <label
          className={cn(
            "flex h-9 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors",
            onlyFree
              ? "border-emerald-500/40 bg-emerald-500/10 font-medium text-emerald-500 shadow-xs"
              : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
          )}
          title={t("settings.onlyFree")}
        >
          <input
            type="checkbox"
            checked={onlyFree}
            onChange={(e) => {
              const val = e.target.checked;
              setOnlyFree(val);
              localStorage.setItem("klodex_only_free", String(val));
              window.dispatchEvent(new CustomEvent("klodex:onlyFreeChanged", { detail: val }));
            }}
            className="sr-only"
          />
          <Sparkles className="size-3.5 text-emerald-500" />
          <span>{t("settings.onlyFree")}</span>
          {onlyFree && <Check className="ml-0.5 size-3 text-emerald-500" />}
        </label>
      </div>

      {/* Providers List with Model Visibility & Expandable Lists */}
      <div className="chat-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredProviders.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {t("settings.providersNotFound")}
          </div>
        ) : (
          filteredProviders.map((p) => {
            const isSelected = selected?.provider === p.id;
            const isReady = p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local";
            const isFree =
              p.category === "free_keyless" ||
              p.id === "opencode" ||
              p.id === "pollinations" ||
              p.status === "keyless";

            const isProviderHidden = disabledProviders.includes(p.id);
            const isExpanded = Boolean(expandedProviders[p.id]);

            // Hidden models count for this provider
            const hiddenModelsCount = p.models.filter(
              (m) => disabledModels.includes(`${p.id}/${m.id}`) || disabledModels.includes(m.id),
            ).length;

            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-xl border transition-all overflow-hidden",
                  isSelected
                    ? "border-primary/40 bg-primary/10 shadow-xs ring-1 ring-primary/20"
                    : !isReady
                      ? "border-border/40 bg-card/30 opacity-80 hover:border-amber-500/40 hover:bg-card/50"
                      : "border-border/50 bg-card/40 hover:border-border/80 hover:bg-card/60",
                  isProviderHidden && "opacity-60 bg-muted/20 border-border/30",
                )}
              >
                {/* Main Provider Row */}
                <div
                  onClick={() => selectProvider(p)}
                  title={!isReady ? t("settings.apiKeyMissing") : undefined}
                  className="flex cursor-pointer items-center justify-between p-3 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs font-semibold text-foreground", isProviderHidden && "text-muted-foreground/60")}>
                        {p.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">({p.id})</span>

                      {p.custom && (
                        <Badge
                          variant="outline"
                          className="h-4 border-primary/40 bg-primary/10 px-1 font-mono text-[9px] text-primary"
                        >
                          {lang === "ru" ? "кастом" : "custom"}
                        </Badge>
                      )}

                      {p.id === "antigravity" && (
                        <Badge
                          variant="outline"
                          className="h-4 border-violet-500/30 bg-violet-500/10 px-1 font-mono text-[9px] text-violet-400"
                          title={t("chat.antigravityTools")}
                        >
                          antigravity tools
                        </Badge>
                      )}

                      {isSelected && (
                        <Badge className="h-4 bg-primary px-1 font-mono text-[9px] text-primary-foreground">
                          {t("catalog.active")}
                        </Badge>
                      )}

                      {isProviderHidden && (
                        <Badge variant="outline" className="h-4 border-border/50 bg-muted/20 px-1 font-mono text-[9px] text-muted-foreground/70">
                          {lang === "ru" ? "скрыт" : "hidden"}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {p.note || t("settings.availableCount", { count: p.models.length })}
                    </div>
                  </div>

                  {/* Actions & Badges */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Status Badge */}
                    {isFree ? (
                      <Badge
                        variant="outline"
                        className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 font-mono text-[10px] text-emerald-500"
                      >
                        {t("settings.badgeFree")}
                      </Badge>
                    ) : p.status === "local" ? (
                      <Badge
                        variant="outline"
                        className="h-5 border-sky-500/30 bg-sky-500/10 px-1.5 font-mono text-[10px] text-sky-500"
                      >
                        {t("settings.badgeLocal")}
                      </Badge>
                    ) : p.hasKey ? (
                      <Badge
                        variant="outline"
                        className="h-5 border-emerald-500/30 px-1.5 font-mono text-[10px] text-emerald-500"
                      >
                        <Check className="mr-1 size-3" /> {t("settings.savedKeyBadge")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="h-5 cursor-pointer border-amber-500/30 bg-amber-500/5 px-1.5 font-mono text-[10px] text-amber-500 hover:bg-amber-500/10"
                      >
                        {t("settings.needKey")}
                      </Badge>
                    )}

                    {/* Custom provider Edit & Delete buttons */}
                    {p.custom && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProvider(p);
                            setCustomDialogOpen(true);
                          }}
                          className="grid size-7 place-items-center rounded-md border border-border/50 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                          title={lang === "ru" ? "Редактировать провайдер" : "Edit provider"}
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === p.id}
                          onClick={(e) => handleDeleteCustomProvider(p.id, e)}
                          className="grid size-7 place-items-center rounded-md border border-border/50 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                          title={lang === "ru" ? "Удалить кастомный провайдер" : "Delete custom provider"}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Visibility toggle button for whole provider */}
                    <button
                      type="button"
                      onClick={(e) => toggleProviderVisibility(p.id, e)}
                      className={cn(
                        "grid size-7 place-items-center rounded-lg border transition-colors cursor-pointer",
                        isProviderHidden
                          ? "border-border/30 bg-muted/15 text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 hover:border-border/60"
                          : "border-border/50 bg-card/40 text-muted-foreground hover:text-foreground hover:bg-card/80 hover:border-border/80",
                      )}
                      title={
                        isProviderHidden
                          ? lang === "ru"
                            ? "Показать провайдер в пикере моделей"
                            : "Show provider in model picker"
                          : lang === "ru"
                            ? "Скрыть провайдер из пикера моделей"
                            : "Hide provider from model picker"
                      }
                    >
                      {isProviderHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>

                    {/* Expand/Collapse models list button */}
                    <button
                      type="button"
                      onClick={(e) => toggleExpanded(p.id, e)}
                      className={cn(
                        "flex h-7 items-center gap-1 rounded-md border border-border/50 bg-card/40 px-2 text-[11px] font-mono text-muted-foreground hover:border-border/80 hover:text-foreground cursor-pointer transition-colors",
                        isExpanded && "border-primary/40 bg-primary/5 text-primary",
                      )}
                      title={lang === "ru" ? "Список моделей" : "Models list"}
                    >
                      <span>
                        {p.models.length} {lang === "ru" ? "мод." : "models"}
                      </span>
                      {hiddenModelsCount > 0 && (
                        <span className="text-[10px] text-amber-500">
                          (-{hiddenModelsCount})
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Models List with Individual Visibility Toggles */}
                {isExpanded && (
                  <div className="border-t border-border/40 bg-card/25 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/20">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {lang === "ru"
                          ? `Управление видимостью моделей (${p.models.length - hiddenModelsCount}/${p.models.length} активно)`
                          : `Model visibility (${p.models.length - hiddenModelsCount}/${p.models.length} active)`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => toggleAllModelsForProvider(p.id, true, e)}
                          className="text-[10px] text-primary hover:underline cursor-pointer"
                        >
                          {lang === "ru" ? "Включить все" : "Show all"}
                        </button>
                        <span className="text-muted-foreground text-[10px]">·</span>
                        <button
                          type="button"
                          onClick={(e) => toggleAllModelsForProvider(p.id, false, e)}
                          className="text-[10px] text-muted-foreground hover:text-destructive hover:underline cursor-pointer"
                        >
                          {lang === "ru" ? "Скрыть все" : "Hide all"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto chat-scroll pr-1">
                      {p.models.map((m) => {
                        const fullKey = `${p.id}/${m.id}`;
                        const isHidden =
                          disabledModels.includes(fullKey) || disabledModels.includes(m.id);

                        return (
                          <div
                            key={m.id}
                            onClick={(e) => toggleModelVisibility(p.id, m.id, e)}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-lg border p-1.5 px-2 cursor-pointer transition-colors text-xs",
                              isHidden
                                ? "border-border/30 bg-muted/20 opacity-50 text-muted-foreground"
                                : "border-border/40 bg-card/40 hover:border-border/80 text-foreground",
                            )}
                          >
                            <div className="min-w-0 flex-1 flex items-center justify-between gap-1.5" title={m.name || m.id}>
                              <span className={cn("font-mono text-[11px] truncate flex-1", isHidden && "text-muted-foreground/40")}>
                                {m.name || m.id}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {m.free && (
                                  <Badge variant="outline" className="h-3.5 px-1 font-mono text-[8px] text-emerald-500 border-emerald-500/30">
                                    free
                                  </Badge>
                                )}
                                {m.contextWindow && (
                                  <span className="font-mono text-[9px] text-muted-foreground">
                                    [{Math.round(m.contextWindow / 1000)}k]
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => toggleModelVisibility(p.id, m.id, e)}
                              className={cn(
                                "grid size-5 place-items-center rounded transition-colors shrink-0",
                                isHidden
                                  ? "text-muted-foreground/40 hover:text-foreground"
                                  : "text-muted-foreground/70 hover:text-foreground",
                              )}
                              title={
                                isHidden
                                  ? lang === "ru"
                                    ? "Показать модель"
                                    : "Show model"
                                  : lang === "ru"
                                    ? "Скрыть модель"
                                    : "Hide model"
                              }
                            >
                              {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Custom Provider Dialog */}
      <CustomProviderDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        initialProvider={editingProvider}
        onSaved={async () => {
          if (onCatalogRefresh) {
            await onCatalogRefresh();
          }
        }}
      />
    </div>
  );
}
