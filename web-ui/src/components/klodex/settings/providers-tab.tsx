import { useMemo } from "react";
import { ArrowUpDown, Check, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
}: ProvidersTabProps) {
  const { t, lang } = useI18n();

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
            {currentProvider?.models.length ?? 0} {t("settings.modelsCount", { count: currentProvider?.models.length ?? 0 })}
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
          <SelectTrigger className="h-9 shrink-0 gap-1.5 border-border/60 bg-card/40 px-2.5 text-xs" title={t("settings.sortMode")}>
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

      {/* Providers List */}
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

            return (
              <div
                key={p.id}
                onClick={() => selectProvider(p)}
                title={!isReady ? t("settings.apiKeyMissing") : undefined}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all",
                  isSelected
                    ? "border-primary/40 bg-primary/10 shadow-xs ring-1 ring-primary/20"
                    : !isReady
                      ? "border-border/40 bg-card/30 opacity-75 hover:border-amber-500/40 hover:bg-card/50 hover:opacity-100"
                      : "border-border/50 bg-card/40 hover:border-border/80 hover:bg-card/70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">({p.id})</span>
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
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {p.note || t("settings.availableCount", { count: p.models.length })}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
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

                  <span className="font-mono text-[11px] text-muted-foreground">
                    {onlyFree
                      ? t("settings.freeCount", { count: p.models.filter((m) => m.free && !m.deprecated).length })
                      : t("settings.modelsCount", { count: p.models.length })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
