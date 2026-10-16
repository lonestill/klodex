import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Key,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Download,
  Terminal,
  ArrowUpCircle,
  Compass,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  api,
  modelKey,
  type KlodexProvider,
  type KlodexSettings,
  type ProviderSort,
  type UpdateStatus,
} from "@/lib/api";

export type SettingsTab = "provider" | "keys" | "agent" | "updates";
type Tab = SettingsTab;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: KlodexProvider[];
  onCatalogRefresh: () => Promise<void>;
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  providerSort?: ProviderSort;
  onProviderSortChange?: (sort: ProviderSort) => void;
  /** Tab to focus each time the dialog opens (e.g. "updates" from the update toast). */
  initialTab?: Tab;
}

export function SettingsDialog({
  open,
  onOpenChange,
  catalog,
  onCatalogRefresh,
  selected,
  onSelectedChange,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "provider");
  const [search, setSearch] = useState("");
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [savedKeyBadge, setSavedKeyBadge] = useState<Record<string, boolean>>({});

  const [maxSteps, setMaxSteps] = useState(64);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [reasoningOpen, setReasoningOpen] = useState(() => {
    return localStorage.getItem("klodex_reasoning_default_open") === "true";
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSavedSettingsSuccess(false);
      if (initialTab) setTab(initialTab);
      void api
        .settings()
        .then((s: KlodexSettings) => {
          if (typeof s.maxSteps === "number") setMaxSteps(s.maxSteps);
          if (s.systemPrompt !== undefined) setSystemPrompt(s.systemPrompt ?? "");
        })
        .catch(() => {});

      void api
        .updateStatus()
        .then(setUpdateStatus)
        .catch(() => {});
    }
  }, [open, initialTab]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      const res = await api.checkUpdate();
      setUpdateStatus(res);
    } catch (err: any) {
      setUpdateMessage(`Ошибка проверки: ${err.message ?? String(err)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    setUpdateLog("Запуск обновления...\n");
    setUpdateMessage(null);
    try {
      const res = await api.applyUpdate();
      setUpdateLog(res.log);
      setUpdateMessage(res.message);
      if (res.ok) {
        const status = await api.updateStatus();
        setUpdateStatus(status);
      }
    } catch (err: any) {
      setUpdateMessage(`Сбой обновления: ${err.message ?? String(err)}`);
    } finally {
      setApplyingUpdate(false);
    }
  };

  // Current active provider
  const currentProvider = useMemo(() => {
    return catalog.find((p) => p.id === selected?.provider) ?? null;
  }, [catalog, selected]);

  // Sorted and filtered providers for the Provider tab
  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...catalog];

    // Priority sort: free_keyless first, then local, then ready (with key), then needs_key
    list.sort((a, b) => {
      const rank = (p: KlodexProvider) => {
        if (p.category === "free_keyless" || p.id === "opencode" || p.id === "pollinations" || p.status === "keyless")
          return 0;
        if (p.status === "local") return 1;
        if (p.hasKey || p.status === "ready") return 2;
        return 3;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.models.some((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [catalog, search]);

  // Providers that accept an API key (exclude purely keyless and local)
  const keyProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog.filter((p) => p.status !== "keyless" && p.status !== "local");
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const selectProvider = (p: KlodexProvider) => {
    const model = p.models[0]?.id ?? "";
    onSelectedChange({ provider: p.id, model });
    localStorage.setItem("klodex_model", modelKey(p.id, model));
    void api.saveSettings({ defaultProvider: p.id, defaultModel: model }).catch(() => {});
  };

  const saveKey = async (providerId: string) => {
    const key = keyDrafts[providerId]?.trim();
    if (!key) return;
    setSavingKey((prev) => ({ ...prev, [providerId]: true }));
    try {
      await api.saveKey(providerId, key);
      await onCatalogRefresh();
      setSavedKeyBadge((prev) => ({ ...prev, [providerId]: true }));
      setKeyDrafts((prev) => ({ ...prev, [providerId]: "" }));
      setTimeout(() => {
        setSavedKeyBadge((prev) => ({ ...prev, [providerId]: false }));
      }, 3000);
    } finally {
      setSavingKey((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.saveSettings({
        maxSteps,
        systemPrompt: systemPrompt.trim(),
      });
      localStorage.setItem("klodex_reasoning_default_open", String(reasoningOpen));
      window.dispatchEvent(
        new CustomEvent("klodex:reasoningDefaultChanged", { detail: reasoningOpen }),
      );
      setSavedSettingsSuccess(true);
      setTimeout(() => setSavedSettingsSuccess(false), 2500);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      void api.saveSettings({
        maxSteps,
        systemPrompt: systemPrompt.trim(),
      }).catch(() => {});
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold">Настройки</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Выбор провайдера, управление ключами и поведение агента
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={refreshingCatalog}
              onClick={async () => {
                setRefreshingCatalog(true);
                await onCatalogRefresh();
                setRefreshingCatalog(false);
              }}
              title="Перечитать провайдеров и модели"
            >
              <RotateCcw className={cn("size-3.5", refreshingCatalog && "animate-spin")} />
              Обновить
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 mt-3">
            <Button
              variant={tab === "provider" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setTab("provider");
                setSearch("");
              }}
            >
              <Cpu className="size-3.5" />
              Провайдер
            </Button>
            <Button
              variant={tab === "keys" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setTab("keys");
                setSearch("");
              }}
            >
              <Key className="size-3.5" />
              API-ключи
            </Button>
            <Button
              variant={tab === "agent" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setTab("agent");
                setSearch("");
              }}
            >
              <Sliders className="size-3.5" />
              Параметры
            </Button>
            <Button
              variant={tab === "updates" ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setTab("updates");
                setSearch("");
              }}
            >
              <Download className="size-3.5" />
              Обновления
              {updateStatus?.hasUpdate && (
                <span className="size-2 rounded-full bg-amber-500 animate-pulse ml-0.5" />
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* Tab 1: Provider selection */}
        {tab === "provider" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 gap-3">
            {/* Active Provider Info */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <div>
                <span className="text-muted-foreground">Текущий провайдер: </span>
                <span className="font-semibold text-foreground">
                  {currentProvider?.name ?? "Не выбран"}
                </span>
                {selected?.model && (
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                    ({selected.model})
                  </span>
                )}
              </div>
              <Badge variant="outline" className="text-[10px]">
                {currentProvider?.models.length ?? 0} моделей
              </Badge>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Поиск провайдера…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Providers List */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1 chat-scroll">
              {filteredProviders.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Провайдеры не найдены
                </div>
              ) : (
                filteredProviders.map((p) => {
                  const isSelected = selected?.provider === p.id;
                  const isFree =
                    p.category === "free_keyless" ||
                    p.id === "opencode" ||
                    p.id === "pollinations" ||
                    p.status === "keyless";

                  return (
                    <div
                      key={p.id}
                      onClick={() => selectProvider(p)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-colors hover:bg-accent/50",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">({p.id})</span>
                          {isSelected && (
                            <Badge className="h-4 px-1 text-[9px] bg-primary text-primary-foreground">
                              Активен
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {p.note || `${p.models.length} моделей доступно`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFree ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                          >
                            Бесплатно
                          </Badge>
                        ) : p.status === "local" ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-sky-500 border-sky-500/30 bg-sky-500/10"
                          >
                            Локально
                          </Badge>
                        ) : p.hasKey ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30"
                          >
                            <Check className="mr-1 size-3" /> Ключ есть
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-amber-500 border-amber-500/30"
                          >
                            Нужен ключ
                          </Badge>
                        )}

                        <span className="text-[11px] text-muted-foreground">
                          {p.models.length} мод.
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: API Keys */}
        {tab === "keys" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 gap-3">
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground leading-relaxed">
              API-ключи сохраняются локально на вашей машине в конфиге{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                ~/.config/klodex/config.jsonc
              </code>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по названию провайдера…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Keys List */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1 chat-scroll">
              {keyProviders.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Провайдеры не найдены
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
                      className="rounded-lg border bg-card p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">({p.id})</span>
                        </div>
                        {isSaved ? (
                          <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500 text-white gap-1">
                            <Check className="size-3" /> Сохранён
                          </Badge>
                        ) : p.hasKey ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30"
                          >
                            <Check className="mr-1 size-3" /> Подключен
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-muted-foreground border-border"
                          >
                            Не задан
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={isShown ? "text" : "password"}
                            placeholder={p.hasKey ? "•••••••••••••••• (ключ сохранён)" : "Вставь API-ключ sk-…"}
                            value={draftVal}
                            onChange={(e) =>
                              setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="h-8 pr-8 text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowKey((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                            }
                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
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
                          className="h-8 text-xs shrink-0"
                          disabled={!draftVal.trim() || isSaving}
                          onClick={() => saveKey(p.id)}
                        >
                          {isSaving ? "Сохранение…" : "Сохранить"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Agent Parameters */}
        {tab === "agent" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 gap-4 chat-scroll">
            {/* Max steps */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Максимум шагов агента (Max Steps)
              </label>
              <Input
                type="number"
                min={1}
                max={256}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value) || 64)}
                className="h-8 max-w-[120px] text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Сколько вызовов инструментов агент может сделать за один сеанс ответа (по умолчанию 64).
              </p>
            </div>

            {/* Reasoning default open */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Показывать ход мыслей (Reasoning)
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant={reasoningOpen ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReasoningOpen(true)}
                >
                  <Sparkles className="mr-1 size-3.5" />
                  Всегда раскрыт
                </Button>
                <Button
                  variant={!reasoningOpen ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setReasoningOpen(false)}
                >
                  Свернут по умолчанию
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Определяет, разворачивать ли блок reasoning автоматически при генерации ответа.
              </p>
            </div>

            {/* System prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Системный промпт (дополнительные инструкции)
              </label>
              <Textarea
                rows={4}
                placeholder="Например: Отвечай кратко, пиши чистый TypeScript, комментируй только неочевидные места..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={() => {
                  void handleSaveSettings();
                }}
                className="text-xs leading-relaxed font-sans"
              />

              <p className="text-[11px] text-muted-foreground">
                Подмешивается ко всем системным промптам моделей перед вызовом.
              </p>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={savingSettings}
                onClick={handleSaveSettings}
              >
                <Save className="size-3.5" />
                {savingSettings ? "Сохранение…" : "Сохранить параметры"}
              </Button>
              {savedSettingsSuccess && (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <CheckCircle2 className="size-3.5" /> Параметры сохранены
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Updates & Maintenance */}
        {tab === "updates" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 gap-4 chat-scroll">
            {/* Version & Repo Info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border bg-card p-3">
                <span className="text-muted-foreground block text-[11px]">Текущая версия</span>
                <span className="font-mono font-bold text-sm text-foreground">v{updateStatus?.currentVersion ?? "0.1.1"}</span>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <span className="text-muted-foreground block text-[11px]">Репозиторий</span>
                <span className="font-mono text-xs font-semibold text-foreground">lonestill/klodex</span>
              </div>
            </div>

            {/* Status card */}
            <div className="rounded-xl border bg-muted/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {updateStatus?.hasUpdate ? (
                    <Badge className="bg-amber-500 text-white gap-1 text-xs">
                      <ArrowUpCircle className="size-3.5" /> Доступно обновление
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 gap-1 text-xs">
                      <Check className="size-3.5" /> Актуальная версия
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {updateStatus?.isGitRepo ? "Режим Git" : "Режим без Git (HTTP-архив)"}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={checkingUpdate || applyingUpdate}
                  onClick={handleCheckUpdate}
                >
                  <RotateCcw className={cn("size-3", checkingUpdate && "animate-spin")} />
                  {checkingUpdate ? "Проверка…" : "Проверить"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {updateStatus?.message || "Авто-апдейтер проверяет новые коммиты и релизы в репозитории lonestill/klodex."}
              </p>

              {updateStatus && !updateStatus.hasGitCli && (
                <p className="text-[11px] text-amber-500/90 leading-relaxed">
                  Git не найден в PATH процесса Клодекса, поэтому обновление идёт через HTTP-архив.
                  Установите Git (Windows: <code className="font-mono">winget install Git.Git</code>) и полностью
                  перезапустите Клодекс — PATH не обновляется у уже запущенных процессов.
                </p>
              )}

              {updateStatus?.releaseNotes && (
                <div className="rounded-md border bg-background/80 p-2.5 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                  {updateStatus.releaseNotes}
                </div>
              )}

              {updateStatus?.hasUpdate && (
                <div className="pt-1">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground"
                    disabled={applyingUpdate}
                    onClick={handleApplyUpdate}
                  >
                    <Download className="size-3.5" />
                    {applyingUpdate ? "Обновление в процессе…" : "Обновить Klodex в один клик"}
                  </Button>
                </div>
              )}
            </div>

            {/* Terminal output log */}
            {updateLog && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Terminal className="size-3.5" />
                  Лог обновления
                </div>
                <pre className="rounded-lg bg-black/90 p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-[150px] leading-relaxed chat-scroll">
                  {updateLog}
                </pre>
              </div>
            )}

            {updateMessage && (
              <div className="rounded-lg border bg-muted p-2.5 text-xs text-foreground">
                {updateMessage}
              </div>
            )}

            {/* Reset / Onboarding re-run */}
            <div className="border-t pt-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold block text-foreground">Мастер первого запуска</span>
                <span className="text-[11px] text-muted-foreground">Пройти стартовый визард настройки заново</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  onOpenChange(false);
                  window.dispatchEvent(new Event("klodex:openOnboarding"));
                }}
              >
                <Compass className="size-3.5" />
                Запустить Onboarding
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
