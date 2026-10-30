import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  Key,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { api, modelKey, type KlodexProvider } from "@/lib/api";

interface ModelPickerPopoverProps {
  catalog: KlodexProvider[];
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  onOpenSettings?: (tab?: "general" | "provider" | "keys") => void;
  onKeyNeeded?: (providerId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ModelPickerPopover({
  catalog,
  selected,
  onSelectedChange,
  onOpenSettings,
  onKeyNeeded,
  disabled = false,
  className,
}: ModelPickerPopoverProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "ready">("all");
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

  useEffect(() => {
    const syncVisibility = () => {
      try {
        setDisabledProviders(JSON.parse(localStorage.getItem("klodex_disabled_providers") || "[]"));
        setDisabledModels(JSON.parse(localStorage.getItem("klodex_disabled_models") || "[]"));
      } catch {}
    };

    window.addEventListener("klodex:visibilityChanged", syncVisibility);
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

    return () => window.removeEventListener("klodex:visibilityChanged", syncVisibility);
  }, []);

  const currentProvider = useMemo(
    () => catalog.find((p) => p.id === selected?.provider),
    [catalog, selected],
  );

  const currentModel = useMemo(() => {
    if (!currentProvider || !selected?.model) return null;
    return currentProvider.models.find((m) => m.id === selected.model) ?? null;
  }, [currentProvider, selected]);

  const isCurrentReady = Boolean(
    currentProvider &&
      (currentProvider.hasKey ||
        currentProvider.status === "ready" ||
        currentProvider.status === "keyless" ||
        currentProvider.status === "local"),
  );

  /* Flatten & group models for quick filtering and selection */
  const groupedData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: Array<{
      provider: KlodexProvider;
      isReady: boolean;
      isFree: boolean;
      models: KlodexProvider["models"];
    }> = [];

    for (const p of catalog) {
      // Exclude hidden provider
      if (disabledProviders.includes(p.id)) continue;

      const isReady = Boolean(
        p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local",
      );
      const isFree =
        p.category === "free_keyless" ||
        p.id === "opencode" ||
        p.id === "pollinations" ||
        p.status === "keyless";

      if (filter === "ready" && !isReady) continue;

      // Exclude hidden models
      let models = p.models.filter((m) => {
        const fullKey = `${p.id}/${m.id}`;
        return !disabledModels.includes(fullKey) && !disabledModels.includes(m.id);
      });
      if (models.length === 0) continue;

      if (filter === "free") {
        models = models.filter((m) => m.free && !m.deprecated);
        if (models.length === 0 && !isFree) continue;
      }

      if (q) {
        const matchesProvider = p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
        if (!matchesProvider) {
          models = models.filter(
            (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
          );
        }
      }

      if (models.length > 0 || q) {
        result.push({
          provider: p,
          isReady,
          isFree,
          models: models.slice(0, 15), // cap for instant rendering performance
        });
      }
    }

    return result;
  }, [catalog, search, filter, disabledProviders, disabledModels]);

  const handleSelect = (providerId: string, modelId: string, isReady: boolean) => {
    if (!isReady) {
      setOpen(false);
      if (onKeyNeeded) {
        onKeyNeeded(providerId);
      } else if (onOpenSettings) {
        onOpenSettings("keys");
      }
      return;
    }

    onSelectedChange({ provider: providerId, model: modelId });
    localStorage.setItem("klodex_model", modelKey(providerId, modelId));
    void api.saveSettings({ defaultProvider: providerId, defaultModel: modelId }).catch(() => {});
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "group flex h-7 max-w-[200px] cursor-pointer select-none items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-left font-mono text-[11px] text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 shrink-0",
            open && "border-primary/40 bg-accent/60 text-foreground ring-1 ring-primary/20",
            className,
          )}
          title={
            selected
              ? `${selected.provider} / ${selected.model}`
              : lang === "ru"
                ? "Выбрать модель"
                : "Select model"
          }
        >
          {/* Status dot */}
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isCurrentReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
            )}
          />

          {/* Provider & Model text */}
          <span className="truncate max-w-[150px]">
            <span className="font-semibold text-foreground/90">
              {currentProvider?.id === "tagflow" ? "ADCode" : (currentProvider?.name ?? selected?.provider ?? "model")}
            </span>
            <span className="mx-1 text-muted-foreground/60">·</span>
            <span className="text-muted-foreground group-hover:text-foreground">
              {(currentModel?.name || selected?.model || (lang === "ru" ? "выбрать" : "select"))
                .replace(/\s*\((?:ADCode Included AI|Tagflow Relay)\)/i, "")
                .trim()}
            </span>
          </span>

          <ChevronDown
            className={cn(
              "size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-hover:text-foreground",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="chat-scroll flex h-[480px] max-h-[80vh] w-[380px] sm:w-[440px] flex-col overflow-hidden p-0 shadow-2xl backdrop-blur-2xl"
      >
        {/* Top Header & Search */}
        <div className="flex shrink-0 flex-col gap-2.5 border-b border-border/60 bg-card/40 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "ru" ? "Поиск модели или провайдера…" : "Search models, providers…"}
              className="h-8.5 bg-background/80 pl-8 pr-7 font-mono text-xs"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors",
                filter === "all"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent",
              )}
            >
              {lang === "ru" ? "Все" : "All"}
            </button>
            <button
              type="button"
              onClick={() => setFilter("ready")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
                filter === "ready"
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent",
              )}
            >
              <Check className="size-3" />
              <span>{lang === "ru" ? "Готовые" : "Ready"}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("free")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
                filter === "free"
                  ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent",
              )}
            >
              <Sparkles className="size-3" />
              <span>{lang === "ru" ? "Бесплатные" : "Free only"}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Model Tree */}
        <div className="chat-scroll flex-1 overflow-y-auto p-2 space-y-3">
          {groupedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
              <Cpu className="size-6 text-muted-foreground/30 mb-2" />
              <span>{t("settings.providersNotFound")}</span>
            </div>
          ) : (
            groupedData.map(({ provider: p, isReady, isFree, models }) => (
              <div key={p.id} className="space-y-1">
                {/* Provider Header */}
                <div className="flex items-center justify-between px-2 py-1 text-[11px]">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground/85">
                    <span>{p.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground font-normal">({p.id})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isFree && (
                      <Badge variant="outline" className="h-4 border-emerald-500/30 px-1 font-mono text-[9px] text-emerald-500">
                        free
                      </Badge>
                    )}
                    {!isReady && (
                      <button
                        type="button"
                        onClick={() => handleSelect(p.id, models[0]?.id || "", false)}
                        className="flex cursor-pointer items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 font-mono text-[9.5px] text-amber-500 hover:bg-amber-500/20"
                        title={lang === "ru" ? "Задать API-ключ" : "Set API key"}
                      >
                        <Key className="size-2.5" />
                        <span>{t("settings.needKey")}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Models List */}
                <div className="space-y-0.5">
                  {models.map((m) => {
                    const isSelected = selected?.provider === p.id && selected?.model === m.id;
                    return (
                      <button
                        key={`${p.id}-${m.id}`}
                        type="button"
                        onClick={() => handleSelect(p.id, m.id, isReady)}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-left font-mono text-xs transition-colors",
                          isSelected
                            ? "border border-primary/30 bg-primary/10 text-foreground font-semibold shadow-xs"
                            : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              isSelected ? "bg-primary" : "bg-transparent",
                            )}
                          />
                          <span className="truncate">{m.name || m.id}</span>
                          {m.free && (
                            <Badge variant="outline" className="h-3.5 border-emerald-500/30 px-1 font-mono text-[8.5px] text-emerald-500">
                              free
                            </Badge>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                          {m.contextWindow && (
                            <span className="opacity-75">[{Math.round(m.contextWindow / 1000)}k]</span>
                          )}
                          {isSelected && <Check className="size-3.5 text-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with Settings shortcut */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-card/40 px-3 py-2 text-[11px]">
          <span className="font-mono text-[10px] text-muted-foreground">
            {catalog.reduce((acc, p) => acc + p.models.length, 0)} {lang === "ru" ? "моделей" : "models"}
          </span>
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings("provider");
              }}
              className="flex cursor-pointer items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <Settings2 className="size-3.5" />
              <span>{lang === "ru" ? "Все провайдеры в настройках" : "Manage in Settings"}</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
