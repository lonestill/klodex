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
  GitBranch,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
  Laptop,
  Globe,
  Bot,
  Workflow,
  ArrowUpDown,
  Link2,
} from "lucide-react";

function applyTheme(t: "dark" | "light" | "system") {
  const root = document.documentElement;
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { AdcodeAuthCard } from "@/components/klodex/adcode-auth-card";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

const TAB_CONFIG: {
  id: Tab;
  label: string;
  title: string;
  description: string;
  icon: typeof Cpu;
}[] = [
  {
    id: "provider",
    label: "Провайдер",
    title: "Выбор провайдера",
    description: "Настройка активного провайдера и модели по умолчанию",
    icon: Cpu,
  },
  {
    id: "keys",
    label: "API-ключи",
    title: "API-ключи",
    description: "Управление ключами доступа к провайдерам (хранятся локально)",
    icon: Key,
  },
  {
    id: "agent",
    label: "Параметры",
    title: "Параметры агента",
    description: "Лимиты шагов, рассуждения и системный промпт",
    icon: Sliders,
  },
  {
    id: "updates",
    label: "Обновления",
    title: "Обновления и статус",
    description: "Версия ядра Klodex, журнал изменений и обслуживание",
    icon: Download,
  },
];

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
  const [maxSubagentSteps, setMaxSubagentSteps] = useState(32);
  const [subagentExplore, setSubagentExplore] = useState("");
  const [subagentCoder, setSubagentCoder] = useState("");
  const [subagentTester, setSubagentTester] = useState("");
  const [subagentGeneral, setSubagentGeneral] = useState("");
  const [importOpenCode, setImportOpenCode] = useState(true);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [reasoningOpen, setReasoningOpen] = useState(() => {
    return localStorage.getItem("klodex_reasoning_default_open") === "true";
  });
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    return (localStorage.getItem("klodex_theme") as "dark" | "light" | "system") || "dark";
  });
  const [sortMode, setSortMode] = useState<ProviderSort>(() => {
    return (localStorage.getItem("klodex_providerSort") as ProviderSort) || "category";
  });
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<Record<string, boolean>>({});
  const [savedUrlBadge, setSavedUrlBadge] = useState<Record<string, boolean>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateDone, setUpdateDone] = useState(false);
  const [restartingServer, setRestartingServer] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updatePhase, setUpdatePhase] = useState("");
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState<boolean>(() => {
    return localStorage.getItem("klodex_only_free") === "true";
  });

  useEffect(() => {
    const freeHandler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setOnlyFree(detail);
    };
    window.addEventListener("klodex:onlyFreeChanged", freeHandler);
    return () => window.removeEventListener("klodex:onlyFreeChanged", freeHandler);
  }, []);

  useEffect(() => {
    if (open) {
      setSavedSettingsSuccess(false);
      setUpdateDone(false);
      setRestartingServer(false);
      setUpdateProgress(0);
      if (initialTab) setTab(initialTab);
      void api
        .settings()
        .then((s: KlodexSettings) => {
          if (typeof s.maxSteps === "number") setMaxSteps(s.maxSteps);
          if (typeof s.maxSubagentSteps === "number") setMaxSubagentSteps(s.maxSubagentSteps);
          if (s.systemPrompt !== undefined) setSystemPrompt(s.systemPrompt ?? "");
          if (s.providerSort) setSortMode(s.providerSort);
          if (s.importOpenCode !== undefined) setImportOpenCode(s.importOpenCode);
          if (s.autoCheckUpdates !== undefined) setAutoCheckUpdates(s.autoCheckUpdates);
          if (s.subagentModels) {
            setSubagentExplore(s.subagentModels.explore ?? "");
            setSubagentCoder(s.subagentModels.coder ?? "");
            setSubagentTester(s.subagentModels.tester ?? "");
            setSubagentGeneral(s.subagentModels.general ?? "");
          }
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
    setUpdateDone(false);
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
    setUpdateLog("Запуск процесса обновления...\n");
    setUpdateMessage(null);
    setUpdateDone(false);
    setRestartingServer(false);
    setUpdateProgress(10);
    setUpdatePhase("Проверка репозитория...");

    const progressTimer = setInterval(() => {
      setUpdateProgress((prev) => {
        if (prev < 30) {
          setUpdatePhase("Загрузка свежих файлов...");
          return prev + 6;
        }
        if (prev < 65) {
          setUpdatePhase("Установка зависимостей...");
          return prev + 4;
        }
        if (prev < 88) {
          setUpdatePhase("Сборка интерфейса...");
          return prev + 2;
        }
        return prev;
      });
    }, 350);

    try {
      const res = await api.applyUpdate();
      clearInterval(progressTimer);
      setUpdateLog(res.log);
      setUpdateMessage(res.message);

      if (res.ok) {
        setUpdateDone(true);
        setUpdateProgress(100);
        setUpdatePhase("Перезапуск сервера Klodex...");
        setRestartingServer(true);

        const startTime = Date.now();
        const pollTimer = setInterval(async () => {
          try {
            if (Date.now() - startTime < 1200) return;
            const health = await api.health();
            if (health?.ok) {
              clearInterval(pollTimer);
              setUpdatePhase("Готово! Обновление страницы...");
              setTimeout(() => {
                window.location.reload();
              }, 300);
            }
          } catch {
            // server process rebooting
          }
          if (Date.now() - startTime > 20000) {
            clearInterval(pollTimer);
            window.location.reload();
          }
        }, 500);
      } else {
        setApplyingUpdate(false);
        setUpdateProgress(0);
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      setApplyingUpdate(false);
      setUpdateProgress(0);
      setUpdateMessage(`Сбой обновления: ${err.message ?? String(err)}`);
    }
  };

  const handleCopyLog = () => {
    if (!updateLog) return;
    void navigator.clipboard.writeText(updateLog);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  // Current active provider
  const currentProvider = useMemo(() => {
    return (Array.isArray(catalog) ? catalog.find((p) => p.id === selected?.provider) : null) ?? null;
  }, [catalog, selected]);

  // Sorted and filtered providers for the Provider tab
  const filteredProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = Array.isArray(catalog) ? [...catalog] : [];

    if (onlyFree) {
      list = list.filter((p) => p.models.some((m) => m.free && !m.deprecated));
    }

    if (sortMode === "alpha") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "models") {
      list.sort((a, b) => b.models.length - a.models.length || a.name.localeCompare(b.name));
    } else {
      // Default: category / priority
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
    }

    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.models.some((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    );
  }, [catalog, search, onlyFree, sortMode]);

  // Providers that accept an API key or custom endpoint
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

  const selectProvider = (p: KlodexProvider) => {
    const isReady = p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local";
    if (!isReady) {
      setTab("keys");
      setSearch(p.name);
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

  const saveBaseUrl = async (providerId: string) => {
    const draft = urlDrafts[providerId];
    if (draft === undefined) return;
    setSavingUrl((prev) => ({ ...prev, [providerId]: true }));
    try {
      await api.saveProviderOptions(providerId, { baseURL: draft.trim() });
      await onCatalogRefresh();
      setSavedUrlBadge((prev) => ({ ...prev, [providerId]: true }));
      setTimeout(() => {
        setSavedUrlBadge((prev) => ({ ...prev, [providerId]: false }));
      }, 3000);
    } finally {
      setSavingUrl((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.saveSettings({
        maxSteps,
        maxSubagentSteps,
        systemPrompt: systemPrompt.trim(),
        providerSort: sortMode,
        importOpenCode,
        autoCheckUpdates,
        subagentModels: {
          explore: subagentExplore.trim() || undefined,
          coder: subagentCoder.trim() || undefined,
          tester: subagentTester.trim() || undefined,
          general: subagentGeneral.trim() || undefined,
        },
      });
      localStorage.setItem("klodex_reasoning_default_open", String(reasoningOpen));
      localStorage.setItem("klodex_providerSort", sortMode);
      localStorage.setItem("klodex_theme", theme);
      applyTheme(theme);
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
        maxSubagentSteps,
        systemPrompt: systemPrompt.trim(),
        providerSort: sortMode,
        importOpenCode,
        autoCheckUpdates,
        subagentModels: {
          explore: subagentExplore.trim() || undefined,
          coder: subagentCoder.trim() || undefined,
          tester: subagentTester.trim() || undefined,
          general: subagentGeneral.trim() || undefined,
        },
      }).catch(() => {});
    }
    onOpenChange(isOpen);
  };

  const availableSubagentModels = useMemo(() => {
    const list: { id: string; name: string; providerName: string }[] = [];
    if (!Array.isArray(catalog)) return list;
    for (const p of catalog) {
      const isReady = p.hasKey || p.status === "keyless" || p.status === "local";
      if (!isReady || !Array.isArray(p.models)) continue;
      for (const m of p.models) {
        if (m.deprecated) continue;
        list.push({
          id: `${p.id}/${m.id}`,
          name: m.name || m.id,
          providerName: p.name,
        });
      }
    }
    return list;
  }, [catalog]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSaveSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    maxSteps,
    maxSubagentSteps,
    systemPrompt,
    sortMode,
    importOpenCode,
    autoCheckUpdates,
    subagentExplore,
    subagentCoder,
    subagentTester,
    subagentGeneral,
    theme,
    reasoningOpen,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[940px] max-w-[95vw] sm:max-w-[940px] h-[640px] max-h-[92vh] flex flex-row p-0 gap-0 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-56 shrink-0 border-r border-border/80 bg-muted/20 flex flex-col justify-between select-none">
          <div className="flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-border/70 flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <KlodexIcon size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Настройки
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground truncate">
                  {updateStatus?.currentVersion ? `klodex v${updateStatus.currentVersion}` : "klodex"}
                </DialogDescription>
              </div>
            </div>

            {/* Vertical Tab Navigation */}
            <nav className="p-2 space-y-1">
              {TAB_CONFIG.map((item) => {
                const Icon = item.icon;
                const isActive = tab === item.id;
                const hasUpdate = item.id === "updates" && updateStatus?.hasUpdate;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {hasUpdate && (
                      <span className="size-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-border/70 flex items-center justify-between text-[10px] text-muted-foreground font-mono bg-muted/10">
            <span>{catalog.length} провайдеров</span>
            <span>{catalog.reduce((acc, p) => acc + p.models.length, 0)} мод.</span>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {/* Right Header */}
          <div className="px-6 py-3.5 border-b border-border/70 shrink-0 flex items-center justify-between pr-14 bg-card/40">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {TAB_CONFIG.find((t) => t.id === tab)?.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {TAB_CONFIG.find((t) => t.id === tab)?.description}
              </p>
            </div>
            {tab === "agent" && (
              <div className="flex items-center gap-2.5">
                {savedSettingsSuccess && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> Сохранено
                  </span>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 px-3"
                  disabled={savingSettings}
                  onClick={handleSaveSettings}
                >
                  {savingSettings ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                  <span>Сохранить</span>
                </Button>
              </div>
            )}
          </div>

          {/* Tab 1: Provider selection */}
          {tab === "provider" && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 gap-3.5">
            {/* Active Provider Info */}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground">Текущий провайдер: </span>
                  <span className="font-semibold text-foreground">
                    {currentProvider?.name ?? "Не выбран"}
                  </span>
                  {currentProvider?.id === "antigravity" && (
                    <Badge
                      variant="outline"
                      className="ml-2 h-4 px-1 text-[9px] text-violet-400 border-violet-500/30 bg-violet-500/10"
                      title="Использует тулы и рантайм Antigravity"
                    >
                      antigravity tools
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {currentProvider?.models.length ?? 0} моделей
                </Badge>
              </div>

              {currentProvider && currentProvider.models.length > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
                    Модель по умолчанию:
                  </span>
                  <select
                    value={selected?.model ?? ""}
                    onChange={(e) => {
                      const m = e.target.value;
                      onSelectedChange({ provider: currentProvider.id, model: m });
                      localStorage.setItem("klodex_model", modelKey(currentProvider.id, m));
                      void api.saveSettings({ defaultProvider: currentProvider.id, defaultModel: m }).catch(() => {});
                    }}
                    className="h-7 text-xs rounded-md border border-border bg-background px-2 font-mono flex-1 min-w-0 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                  >
                    {currentProvider.models
                      .filter((m) => !onlyFree || (m.free && !m.deprecated))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}{m.free ? " (Free)" : ""}{m.contextWindow ? ` [${Math.round(m.contextWindow / 1000)}k]` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Search, Sort, and Only Free toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск провайдера…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>

              {/* Sort Mode */}
              <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border bg-card shrink-0">
                <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                <select
                  value={sortMode}
                  onChange={(e) => {
                    const sm = e.target.value as ProviderSort;
                    setSortMode(sm);
                    localStorage.setItem("klodex_providerSort", sm);
                    void api.saveSettings({ providerSort: sm }).catch(() => {});
                  }}
                  className="h-full bg-transparent text-xs text-foreground cursor-pointer focus:outline-hidden"
                  title="Порядок сортировки провайдеров"
                >
                  <option value="category">По типу / статусу</option>
                  <option value="alpha">По алфавиту (А-Я)</option>
                  <option value="models">По числу моделей</option>
                </select>
              </div>

              {/* Only Free */}
              <label
                className={cn(
                  "flex items-center gap-1.5 h-9 px-2.5 rounded-md border text-xs cursor-pointer select-none transition-colors shrink-0",
                  onlyFree
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                title="Отображать только провайдеров с бесплатными моделями"
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
                <span>Только Free</span>
                {onlyFree && <Check className="size-3 ml-0.5 text-emerald-500" />}
              </label>
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
                      title={!isReady ? "Требуется API-ключ. Нажмите, чтобы перейти к вводу ключа" : undefined}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition-colors hover:bg-accent/50",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-xs"
                          : !isReady
                            ? "border-border/60 bg-card/60 opacity-80 hover:opacity-100 hover:border-amber-500/40"
                            : "border-border bg-card",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">({p.id})</span>
                          {p.id === "antigravity" && (
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[9px] text-violet-400 border-violet-500/30 bg-violet-500/10"
                              title="Использует тулы и рантайм Antigravity"
                            >
                              antigravity tools
                            </Badge>
                          )}
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
                            className="h-5 px-1.5 text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer"
                          >
                            Нужен ключ →
                          </Badge>
                        )}

                        <span className="text-[11px] text-muted-foreground">
                          {onlyFree ? `${p.models.filter((m) => m.free && !m.deprecated).length} free мод.` : `${p.models.length} мод.`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: API Keys & Custom Endpoints */}
        {tab === "keys" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 gap-3.5">
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground leading-relaxed">
              API-ключи и кастомные Base URL сохраняются локально на вашей машине в конфиге{" "}
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

            {/* Keys & Endpoints List */}
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
                      className="rounded-lg border bg-card p-3 space-y-2.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">({p.id})</span>
                          {p.category === "free_keyless" && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] text-emerald-500 border-emerald-500/30">
                              Free
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
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
                      </div>

                      {/* API Key Row */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={isShown ? "text" : "password"}
                            placeholder={
                              p.id === "tagflow"
                                ? (p.hasKey ? "•••••••••••••••• (аккаунт подключен)" : "email:password или токен ADCode")
                                : (p.hasKey ? "•••••••••••••••• (ключ сохранён)" : "Вставь API-ключ sk-…")
                            }
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

                      {/* Special ADCode Auth Card */}
                      {p.id === "tagflow" && (
                        <div className="pt-2 border-t border-border/40 space-y-2">
                          <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                            <span>Быстрая авторизация / Регистрация ADCode (1M токенов/день)</span>
                            {p.hasKey && (
                              <span className="text-emerald-500 text-[10px] flex items-center gap-1 font-mono">
                                <Check className="size-3" /> Привязан
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
                      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 w-16">
                          <Globe className="size-3 text-muted-foreground" />
                          <span>Base URL:</span>
                        </div>
                        <Input
                          type="text"
                          placeholder={p.baseURL ? `Текущий: ${p.baseURL}` : "https://api.example.com/v1"}
                          value={urlDrafts[p.id] ?? p.baseURL ?? ""}
                          onChange={(e) =>
                            setUrlDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          className="h-7 text-xs font-mono flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] shrink-0"
                          disabled={urlDrafts[p.id] === undefined || savingUrl[p.id]}
                          onClick={() => saveBaseUrl(p.id)}
                        >
                          {savingUrl[p.id]
                            ? "…"
                            : savedUrlBadge[p.id]
                              ? "Сохранено ✓"
                              : "Сохранить URL"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Agent Parameters & Environment */}
        {tab === "agent" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 gap-4 chat-scroll">
            {/* 1. Поведение агента */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Sliders className="size-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">Поведение агента</h3>
              </div>

              {/* Максимум шагов */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">Максимум шагов</div>
                  <div className="text-[11px] text-muted-foreground">
                    Лимит вызовов инструментов за один сеанс ответа
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/60">
                    {[32, 64, 128].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMaxSteps(s)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer",
                          maxSteps === s
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={256}
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Math.max(1, Math.min(256, Number(e.target.value) || 64)))}
                    className="h-7 w-14 text-center text-xs font-mono"
                  />
                </div>
              </div>

              {/* Ход мыслей */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div>
                  <div className="text-xs font-medium text-foreground">Ход мыслей (Reasoning)</div>
                  <div className="text-[11px] text-muted-foreground">
                    По умолчанию разворачивать блок рассуждений модели
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/60 shrink-0">
                  <button
                    type="button"
                    onClick={() => setReasoningOpen(true)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded transition-colors cursor-pointer",
                      reasoningOpen
                        ? "bg-background text-foreground font-medium shadow-xs border border-border/80"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Раскрыт
                  </button>
                  <button
                    type="button"
                    onClick={() => setReasoningOpen(false)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded transition-colors cursor-pointer",
                      !reasoningOpen
                        ? "bg-background text-foreground font-medium shadow-xs border border-border/80"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Свёрнут
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Субагенты и Swarm */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Workflow className="size-4 text-sky-400" />
                <h3 className="text-xs font-semibold text-foreground">Субагенты и Swarm</h3>
              </div>

              {/* Шагов на субагента */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">Лимит шагов субагента</div>
                  <div className="text-[11px] text-muted-foreground">
                    Бюджет шагов на выполнение фоновой подзадачи
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/60">
                    {[16, 32, 64].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMaxSubagentSteps(s)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer",
                          maxSubagentSteps === s
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={128}
                    value={maxSubagentSteps}
                    onChange={(e) => setMaxSubagentSteps(Math.max(1, Math.min(128, Number(e.target.value) || 32)))}
                    className="h-7 w-14 text-center text-xs font-mono"
                  />
                </div>
              </div>

              {/* Список ролей субагентов */}
              <div className="space-y-1.5 pt-2 border-t border-border/40">
                <div className="text-[11px] font-medium text-muted-foreground mb-1">
                  Модели для специализированных ролей:
                </div>
                {[
                  {
                    role: "explore",
                    name: "Explore",
                    desc: "Поиск, grep, исследование кодовой базы",
                    val: subagentExplore,
                    setVal: setSubagentExplore,
                  },
                  {
                    role: "coder",
                    name: "Coder",
                    desc: "Генерация и точечные правки кода",
                    val: subagentCoder,
                    setVal: setSubagentCoder,
                  },
                  {
                    role: "tester",
                    name: "Tester",
                    desc: "Прогон тестов и проверка исправлений",
                    val: subagentTester,
                    setVal: setSubagentTester,
                  },
                  {
                    role: "general",
                    name: "General",
                    desc: "Универсальные комплексные подзадачи",
                    val: subagentGeneral,
                    setVal: setSubagentGeneral,
                  },
                ].map((item) => (
                  <div
                    key={item.role}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border/50 bg-background/50"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">({item.desc})</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={item.val}
                        onChange={(e) => item.setVal(e.target.value)}
                        className="h-7 max-w-[260px] text-xs rounded border border-border bg-background px-2 font-mono text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="">Как у родителя</option>
                        {availableSubagentModels.map((m) => (
                          <option key={`${item.role}-${m.id}`} value={m.id}>
                            {m.providerName} / {m.name}
                          </option>
                        ))}
                      </select>
                      {item.val && (
                        <button
                          type="button"
                          onClick={() => item.setVal("")}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-1 cursor-pointer"
                          title="Сбросить на значение по умолчанию"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Системные инструкции */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-foreground">Системные инструкции</h3>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {systemPrompt.length} симв.
                </span>
              </div>

              {/* Пресеты */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1">Шаблоны:</span>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      "Пиши только чистый рабочий код без лишних пояснений, воды и вежливых вступлений. Не меняй форматирование нетронутых строк. Не добавляй комментарии 'добавьте код сюда'.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  Лаконичный код
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      "Анализируй архитектурные риски перед написанием кода. Указывай на скрытые грабли, избегай оверинжиниринга. Предлагай самые надежные и минимальные решения.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  Архитектор & Риски
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      "Перед любыми правками тщательно исследуй кодовую базу, проверяй типы и зависимости. Убедись в обратной совместимости.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  Глубокий аудит
                </button>
                {systemPrompt && (
                  <button
                    type="button"
                    onClick={() => setSystemPrompt("")}
                    className="px-2 py-0.5 text-[11px] rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>

              <Textarea
                rows={4}
                placeholder="Например: Отвечай кратко, пиши строгий TypeScript, комментируй только нетривиальные алгоритмы..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="text-xs leading-relaxed font-mono resize-y"
              />
            </div>

            {/* 4. Интерфейс и интеграции */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Laptop className="size-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-foreground">Интерфейс и окружение</h3>
              </div>

              {/* Тема */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">Тема оформления</div>
                  <div className="text-[11px] text-muted-foreground">Цветовая схема Klodex</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[
                    { id: "dark", label: "Тёмная", icon: Moon },
                    { id: "light", label: "Светлая", icon: Sun },
                    { id: "system", label: "Системная", icon: Laptop },
                  ].map((t) => {
                    const Icon = t.icon;
                    const isCur = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTheme(t.id as any);
                          applyTheme(t.id as any);
                          localStorage.setItem("klodex_theme", t.id);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer",
                          isCur
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* OpenCode */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div>
                  <div className="text-xs font-medium text-foreground">Автоимпорт из OpenCode</div>
                  <div className="text-[11px] text-muted-foreground">
                    Подтягивать ключи и настройки из ~/.config/opencode
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={importOpenCode}
                  onChange={(e) => setImportOpenCode(e.target.checked)}
                  className="size-4 rounded border-border accent-primary cursor-pointer"
                />
              </div>

              {/* Проверка обновлений */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div>
                  <div className="text-xs font-medium text-foreground">Фоновая проверка обновлений</div>
                  <div className="text-[11px] text-muted-foreground">
                    Периодически проверять новые релизы ядра Klodex
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoCheckUpdates}
                  onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                  className="size-4 rounded border-border accent-primary cursor-pointer"
                />
              </div>
            </div>

            <div className="text-center py-2 text-[11px] text-muted-foreground font-mono">
              Нажмите Cmd+S для быстрого сохранения
            </div>
          </div>
        )}

        {/* Tab 4: Updates & Maintenance */}
        {tab === "updates" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 gap-5 chat-scroll">
            {/* Top Control Bar: Brand + Repo + Check action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                  <KlodexIcon size={20} />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">Klodex Core</span>
                    {updateStatus?.currentVersion && (
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30">
                        v{updateStatus.currentVersion}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <a
                      href="https://github.com/lonestill/klodex"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <GitBranch className="size-3 text-muted-foreground/80" />
                      <span>lonestill/klodex</span>
                      <ExternalLink className="size-2.5 opacity-60" />
                    </a>
                    <span>·</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground">
                      {updateStatus?.isGitRepo ? "Git tracking" : "HTTP Archive"}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer shadow-xs"
                disabled={checkingUpdate || applyingUpdate}
                onClick={handleCheckUpdate}
              >
                <RotateCcw className={cn("size-3.5", checkingUpdate && "animate-spin")} />
                {checkingUpdate ? "Проверка…" : "Проверить обновления"}
              </Button>
            </div>

            {/* Active Update / Restart Progress Card */}
            {(applyingUpdate || restartingServer) && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <Loader2 className={cn("size-4 animate-spin", restartingServer ? "text-emerald-400" : "text-primary")} />
                    <span>{restartingServer ? "Перезапуск сервера Klodex..." : updatePhase || "Обновление..."}</span>
                  </div>
                  <span className="font-mono text-sm font-bold text-primary">
                    {updateProgress}%
                  </span>
                </div>

                <Progress
                  value={updateProgress}
                  indicatorClassName={restartingServer ? "bg-emerald-500" : "bg-primary"}
                  className="h-2.5"
                />

                {/* 4-Phase Stepper */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  {[
                    { label: "1. Загрузка", target: 30 },
                    { label: "2. Зависимости", target: 65 },
                    { label: "3. Сборка UI", target: 88 },
                    { label: "4. Перезапуск", target: 100 },
                  ].map((step, idx) => {
                    const isCompleted = updateProgress >= step.target;
                    const isCurrent = updateProgress < step.target && (idx === 0 || updateProgress >= [0, 30, 65, 88][idx]);
                    return (
                      <div
                        key={step.label}
                        className={cn(
                          "rounded-lg p-2 border text-center transition-colors",
                          isCompleted
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                            : isCurrent
                              ? "border-primary/40 bg-primary/10 text-foreground font-semibold"
                              : "border-border/40 bg-muted/20 text-muted-foreground opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {isCompleted ? (
                            <Check className="size-3 text-emerald-400" />
                          ) : isCurrent ? (
                            <Loader2 className="size-3 animate-spin text-primary" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                          )}
                          <span>{step.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {restartingServer
                    ? "Сервер перезапускается в фоне с новым кодом. Страница перезагрузится автоматически."
                    : "Процесс обновления и пересборки идёт автоматически. Не закрывайте окно до завершения."}
                </p>
              </div>
            )}

            {/* Status Hero Card (when not currently updating) */}
            {!applyingUpdate && !restartingServer && (
              updateStatus?.hasUpdate ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3.5 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="relative flex size-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full size-2.5 bg-amber-500" />
                        </span>
                        <span className="font-semibold text-sm text-foreground">
                          Доступно обновление
                        </span>
                        <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 font-mono text-[11px] h-5 px-1.5">
                          v{updateStatus.currentVersion} → v{updateStatus.latestVersion ?? "latest"}
                        </Badge>
                        {Boolean(updateStatus.commitsBehind) && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            (+{updateStatus.commitsBehind} commits)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {updateStatus.message || "В репозитории появились свежие коммиты и улучшения. Обновите Klodex в один клик с полным автоперезапуском."}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="h-9 px-4 gap-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer shrink-0"
                      onClick={handleApplyUpdate}
                    >
                      <Download className="size-3.5" />
                      <span>Обновить с автоперезапуском</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center shrink-0 mt-0.5 border border-emerald-500/20">
                      <Check className="size-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                        <span>У вас установлена актуальная версия Klodex</span>
                        {updateStatus?.currentVersion && (
                          <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 h-4">
                            v{updateStatus.currentVersion}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Все модули, модели и тулы обновлены до последней стабильной ревизии.
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Warning if Git CLI missing */}
            {updateStatus && !updateStatus.hasGitCli && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5 text-xs text-amber-500/95 leading-relaxed">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <span className="font-semibold block text-foreground">Git CLI не найден в PATH процесса</span>
                  <span className="text-[11px] text-muted-foreground">
                    Обновление выполняется через HTTP-архив. Для мгновенных инкрементальных обновлений установите Git{" "}
                    (Windows: <code className="font-mono text-foreground px-1 bg-muted rounded">winget install Git.Git</code>) и перезапустите Клодекс.
                  </span>
                </div>
              </div>
            )}

            {/* Release notes / Commits log */}
            {updateStatus?.releaseNotes && !applyingUpdate && !restartingServer && (
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span>Список последних коммитов</span>
                </div>
                <div className="rounded-lg border bg-zinc-950/70 p-3 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap max-h-[140px] overflow-y-auto chat-scroll leading-relaxed">
                  {updateStatus.releaseNotes}
                </div>
              </div>
            )}

            {/* Collapsible Terminal Log (Hidden by default, available on demand) */}
            {updateLog && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUpdateLog((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Terminal className="size-3.5" />
                  <span>Технические подробности сборки (лог)</span>
                  {showUpdateLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>

                {showUpdateLog && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-lg space-y-0 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-800/80 bg-zinc-900/80">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2.5 rounded-full bg-rose-500/80" />
                          <span className="size-2.5 rounded-full bg-amber-500/80" />
                          <span className="size-2.5 rounded-full bg-emerald-500/80" />
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400 ml-2 flex items-center gap-1.5">
                          <span>klodex-updater.log</span>
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-mono text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1 cursor-pointer"
                        onClick={handleCopyLog}
                      >
                        {copiedLog ? (
                          <>
                            <Check className="size-3 text-emerald-400" />
                            <span className="text-emerald-400">Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Копировать</span>
                          </>
                        )}
                      </Button>
                    </div>

                    <pre className="p-3.5 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-[160px] leading-relaxed chat-scroll select-text">
                      {updateLog}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {updateMessage && !updateDone && (
              <div className="rounded-xl border border-border/80 bg-muted/60 p-3 text-xs text-foreground flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-muted-foreground" />
                <span className="leading-relaxed">{updateMessage}</span>
              </div>
            )}

            {/* Maintenance & Onboarding card */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-auto">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold block text-foreground">Мастер первого запуска</span>
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  Сбросить состояние первоначального знакомства и запустить Onboarding Wizard заново.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
