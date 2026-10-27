import { useMemo } from "react";
import { Check, Eye, EyeOff, Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdcodeAuthCard } from "@/components/klodex/adcode-auth-card";
import { useI18n } from "@/lib/i18n";
import type { KlodexProvider } from "@/lib/api";

interface KeysTabProps {
  catalog: KlodexProvider[];
  search: string;
  setSearch: (s: string) => void;
  keyDrafts: Record<string, string>;
  setKeyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  showKey: Record<string, boolean>;
  setShowKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  savingKey: Record<string, boolean>;
  savedKeyBadge: Record<string, boolean>;
  saveKey: (providerId: string) => Promise<void>;
  urlDrafts: Record<string, string>;
  setUrlDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingUrl: Record<string, boolean>;
  savedUrlBadge: Record<string, boolean>;
  saveBaseUrl: (providerId: string) => Promise<void>;
  onCatalogRefresh: () => Promise<void>;
}

export function KeysTab({
  catalog,
  search,
  setSearch,
  keyDrafts,
  setKeyDrafts,
  showKey,
  setShowKey,
  savingKey,
  savedKeyBadge,
  saveKey,
  urlDrafts,
  setUrlDrafts,
  savingUrl,
  savedUrlBadge,
  saveBaseUrl,
  onCatalogRefresh,
}: KeysTabProps) {
  const { t, lang } = useI18n();

  const keyProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog.filter(
      (p) => p.status !== "keyless" || p.baseURL || p.id === "ollama" || p.id === "lmstudio",
    );
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 gap-4">
      {/* Notice Banner */}
      <div className="rounded-xl border border-border/50 bg-card/40 p-3 text-xs text-muted-foreground leading-relaxed shadow-xs backdrop-blur-sm">
        {t("settings.keysNotice")}{" "}
        <code className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          ~/.config/klodex/config.jsonc
        </code>
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder={t("settings.searchProvider")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-xs bg-card/40 border-border/60"
        />
      </div>

      {/* Providers with Keys / Endpoints */}
      <div className="chat-scroll min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {keyProviders.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {t("settings.providersNotFound")}
          </div>
        ) : (
          keyProviders.map((p) => {
            const isSaving = savingKey[p.id];
            const isSaved = savedKeyBadge[p.id];
            const isShown = showKey[p.id];
            const draftVal = keyDrafts[p.id] ?? "";

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-border/50 bg-card/40 p-4 space-y-3 shadow-xs backdrop-blur-sm"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">({p.id})</span>
                    {p.category === "free_keyless" && (
                      <Badge variant="outline" className="h-4 border-emerald-500/30 px-1 font-mono text-[9px] text-emerald-500">
                        Free
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isSaved ? (
                      <Badge className="h-5 gap-1 bg-emerald-500 px-1.5 font-mono text-[10px] text-white">
                        <Check className="size-3" /> {t("settings.savedKeyBadge")}
                      </Badge>
                    ) : p.hasKey ? (
                      <Badge
                        variant="outline"
                        className="h-5 border-emerald-500/30 px-1.5 font-mono text-[10px] text-emerald-500"
                      >
                        <Check className="mr-1 size-3" /> {lang === "ru" ? "Подключен" : "Connected"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="h-5 border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {lang === "ru" ? "Не задан" : "Not set"}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* API Key Row */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isShown ? "text" : "password"}
                      placeholder={
                        p.id === "tagflow"
                          ? (p.hasKey
                              ? (lang === "ru" ? "•••••••••••••••• (аккаунт подключен)" : "•••••••••••••••• (account connected)")
                              : (lang === "ru" ? "email:password или токен ADCode" : "email:password or ADCode token"))
                          : (p.hasKey
                              ? (lang === "ru" ? "•••••••••••••••• (ключ сохранён)" : "•••••••••••••••• (key saved)")
                              : t("settings.enterKey"))
                      }
                      value={draftVal}
                      onChange={(e) =>
                        setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className="h-8.5 pr-8 bg-background/80 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowKey((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                      }
                      className="absolute right-2.5 top-2.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                    >
                      {isShown ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    className="h-8.5 text-xs shrink-0 cursor-pointer"
                    disabled={!draftVal.trim() || isSaving}
                    onClick={() => void saveKey(p.id)}
                  >
                    {isSaving ? (lang === "ru" ? "Сохранение…" : "Saving…") : t("settings.saveKey")}
                  </Button>
                </div>

                {/* ADCode Auth Card */}
                {p.id === "tagflow" && (
                  <div className="space-y-2 border-t border-border/40 pt-3">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span>
                        {lang === "ru"
                          ? "Быстрая авторизация / Регистрация ADCode (1M токенов/день)"
                          : "Quick Authorization / ADCode Registration (1M tokens/day)"}
                      </span>
                      {p.hasKey && (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-500">
                          <Check className="size-3" /> {lang === "ru" ? "Привязан" : "Linked"}
                        </span>
                      )}
                    </div>
                    <AdcodeAuthCard
                      onSuccess={async () => {
                        await onCatalogRefresh();
                      }}
                    />
                  </div>
                )}

                {/* Custom Base URL Row */}
                <div className="flex items-center gap-2 border-t border-border/40 pt-2.5">
                  <div className="flex w-16 shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Globe className="size-3 text-muted-foreground" />
                    <span>Base URL:</span>
                  </div>
                  <Input
                    type="text"
                    placeholder={
                      p.baseURL
                        ? `${lang === "ru" ? "Текущий" : "Current"}: ${p.baseURL}`
                        : "https://api.example.com/v1"
                    }
                    value={urlDrafts[p.id] ?? p.baseURL ?? ""}
                    onChange={(e) =>
                      setUrlDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="h-8 bg-background/80 font-mono text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 text-xs cursor-pointer"
                    disabled={urlDrafts[p.id] === undefined || savingUrl[p.id]}
                    onClick={() => void saveBaseUrl(p.id)}
                  >
                    {savingUrl[p.id]
                      ? "…"
                      : savedUrlBadge[p.id]
                        ? (lang === "ru" ? "Сохранено ✓" : "Saved ✓")
                        : t("settings.saveBaseUrl")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
