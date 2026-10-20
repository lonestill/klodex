import { useEffect, useMemo, useState, useCallback } from "react";
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
  BarChart3,
  Database,
  Trash2,
  Clock,
  TrendingUp,
  Coins,
  Zap,
  Minimize2,
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

function formatTokensNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  return (n || 0).toLocaleString();
}

import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { AdcodeAuthCard } from "@/components/klodex/adcode-auth-card";
import { useI18n } from "@/lib/i18n";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  api,
  modelKey,
  type KlodexProvider,
  type KlodexSettings,
  type ProviderSort,
  type UpdateStatus,
  type FullTokenStatsReport,
} from "@/lib/api";

export type SettingsTab = "provider" | "keys" | "agent" | "stats" | "updates";
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
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab ?? "provider");

  const tabConfig = useMemo(() => [
    {
      id: "provider" as const,
      label: t("settings.tabProvider"),
      title: t("settings.tabProvider"),
      description: t("settings.tabProviderDesc"),
      icon: Cpu,
    },
    {
      id: "keys" as const,
      label: t("settings.tabKeys"),
      title: t("settings.tabKeys"),
      description: t("settings.tabKeysDesc"),
      icon: Key,
    },
    {
      id: "agent" as const,
      label: t("settings.tabAgent"),
      title: t("settings.tabAgent"),
      description: t("settings.tabAgentDesc"),
      icon: Sliders,
    },
    {
      id: "stats" as const,
      label: t("settings.tabStats"),
      title: t("settings.tabStats"),
      description: t("settings.tabStatsDesc"),
      icon: BarChart3,
    },
    {
      id: "updates" as const,
      label: t("settings.tabUpdates"),
      title: t("settings.tabUpdates"),
      description: t("settings.tabUpdatesDesc"),
      icon: Download,
    },
  ], [t]);
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
  const [tokenStats, setTokenStats] = useState<FullTokenStatsReport | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [clearingStats, setClearingStats] = useState(false);
  const [confirmClearStats, setConfirmClearStats] = useState(false);

  const loadTokenStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await api.stats();
      setTokenStats(data);
    } catch (e) {
      console.error("Failed to load token stats:", e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const handleClearStats = async () => {
    setClearingStats(true);
    try {
      await api.resetStats();
      await loadTokenStats();
      setConfirmClearStats(false);
    } catch (e) {
      console.error("Failed to clear stats:", e);
    } finally {
      setClearingStats(false);
    }
  };

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

      void loadTokenStats();
    }
  }, [open, initialTab, loadTokenStats]);

  useEffect(() => {
    if (open && tab === "stats") {
      void loadTokenStats();
    }
  }, [open, tab, loadTokenStats]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    setUpdateDone(false);
    try {
      const res = await api.checkUpdate();
      setUpdateStatus(res);
    } catch (err: any) {
      setUpdateMessage(`${t("toast.error")}: ${err.message ?? String(err)}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    setApplyingUpdate(true);
    setUpdateLog(lang === "ru" ? "Запуск процесса обновления...\n" : "Starting update process...\n");
    setUpdateMessage(null);
    setUpdateDone(false);
    setRestartingServer(false);
    setUpdateProgress(10);
    setUpdatePhase(t("toast.phaseChecking"));

    const progressTimer = setInterval(() => {
      setUpdateProgress((prev) => {
        if (prev < 30) {
          setUpdatePhase(t("toast.phasePulling"));
          return prev + 6;
        }
        if (prev < 65) {
          setUpdatePhase(t("toast.phaseDeps"));
          return prev + 4;
        }
        if (prev < 88) {
          setUpdatePhase(t("toast.phaseBuild"));
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
        setUpdatePhase(t("toast.phaseRestart"));
        setRestartingServer(true);

        const startTime = Date.now();
        const pollTimer = setInterval(async () => {
          try {
            if (Date.now() - startTime < 1200) return;
            const health = await api.health();
            if (health?.ok) {
              clearInterval(pollTimer);
              setUpdatePhase(t("toast.phaseDone"));
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
      setUpdateMessage(`${t("toast.error")}: ${err.message ?? String(err)}`);
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
                  {t("settings.title")}
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground truncate">
                  {updateStatus?.currentVersion ? `klodex v${updateStatus.currentVersion}` : "klodex"}
                </DialogDescription>
              </div>
            </div>

            {/* Vertical Tab Navigation */}
            <nav className="p-2 space-y-1">
              {tabConfig.map((item) => {
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
            <span>{catalog.length} {t("settings.providersCount", { count: catalog.length })}</span>
            <span>{catalog.reduce((acc, p) => acc + p.models.length, 0)} {t("settings.modelsCount", { count: catalog.reduce((acc, p) => acc + p.models.length, 0) })}</span>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
          {/* Right Header */}
          <div className="px-6 py-3.5 border-b border-border/70 shrink-0 flex items-center justify-between pr-14 bg-card/40">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {tabConfig.find((tc) => tc.id === tab)?.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tabConfig.find((tc) => tc.id === tab)?.description}
              </p>
            </div>
            {tab === "agent" && (
              <div className="flex items-center gap-2.5">
                {savedSettingsSuccess && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> {t("settings.saved")}
                  </span>
                )}
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 px-3"
                  disabled={savingSettings}
                  onClick={handleSaveSettings}
                >
                  {savingSettings ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                  <span>{t("settings.saveSettings")}</span>
                </Button>
              </div>
            )}
            {tab === "stats" && (
              <div className="flex items-center gap-2">
                {confirmClearStats ? (
                  <div className="flex items-center gap-1.5 animate-in fade-in">
                    <span className="text-[11px] text-destructive font-medium">{t("settings.confirmResetHistory")}</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs px-2.5 cursor-pointer"
                      disabled={clearingStats}
                      onClick={handleClearStats}
                    >
                      {clearingStats ? <Loader2 className="size-3 animate-spin" /> : t("settings.reset")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 cursor-pointer"
                      onClick={() => setConfirmClearStats(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1 px-2 cursor-pointer"
                    onClick={() => setConfirmClearStats(true)}
                    title={t("stats.clearHistory")}
                  >
                    <Trash2 className="size-3" />
                    <span>{t("settings.reset")}</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer shadow-xs"
                  disabled={loadingStats}
                  onClick={loadTokenStats}
                  title={t("stats.refresh")}
                >
                  <RotateCcw className={cn("size-3", loadingStats && "animate-spin")} />
                  <span>{t("stats.refresh")}</span>
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
                  <span className="text-muted-foreground">{t("settings.currentProvider")} </span>
                  <span className="font-semibold text-foreground">
                    {currentProvider?.name ?? t("settings.notSelected")}
                  </span>
                  {currentProvider?.id === "antigravity" && (
                    <Badge
                      variant="outline"
                      className="ml-2 h-4 px-1 text-[9px] text-violet-400 border-violet-500/30 bg-violet-500/10"
                      title={t("chat.antigravityTools")}
                    >
                      antigravity tools
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {currentProvider?.models.length ?? 0} {t("settings.modelsCount", { count: currentProvider?.models.length ?? 0 })}
                </Badge>
              </div>

              {currentProvider && currentProvider.models.length > 0 && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
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
                    <SelectTrigger className="h-7 text-xs font-mono flex-1 min-w-0 max-w-[340px] bg-background">
                      <SelectValue placeholder={t("settings.chooseModel")} />
                    </SelectTrigger>
                    <SelectContent align="end" className="max-h-[300px] chat-scroll">
                      {currentProvider.models
                        .filter((m) => !onlyFree || (m.free && !m.deprecated))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                            <span className="truncate">{m.name || m.id}</span>
                            {m.free && (
                              <Badge variant="outline" className="ml-1.5 h-3.5 px-1 text-[8px] text-emerald-500 border-emerald-500/30">
                                free
                              </Badge>
                            )}
                            {m.contextWindow && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
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

            {/* Search, Sort, and Only Free toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder={t("settings.searchProvider")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
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
                <SelectTrigger className="h-9 px-2.5 gap-1.5 text-xs bg-card shrink-0" title={t("settings.sortMode")}>
                  <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t("settings.sortMode")} />
                </SelectTrigger>
                <SelectContent align="end" className="text-xs">
                  <SelectItem value="category" className="text-xs">{t("settings.sortCategory")}</SelectItem>
                  <SelectItem value="alpha" className="text-xs">{t("settings.sortAlpha")}</SelectItem>
                  <SelectItem value="models" className="text-xs">{t("settings.sortModels")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Only Free */}
              <label
                className={cn(
                  "flex items-center gap-1.5 h-9 px-2.5 rounded-md border text-xs cursor-pointer select-none transition-colors shrink-0",
                  onlyFree
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
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
                {onlyFree && <Check className="size-3 ml-0.5 text-emerald-500" />}
              </label>
            </div>

            {/* Providers List */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1 chat-scroll">
              {filteredProviders.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
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
                              title={t("chat.antigravityTools")}
                            >
                              antigravity tools
                            </Badge>
                          )}
                          {isSelected && (
                            <Badge className="h-4 px-1 text-[9px] bg-primary text-primary-foreground">
                              {t("catalog.active")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {p.note || t("settings.availableCount", { count: p.models.length })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFree ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                          >
                            {t("settings.badgeFree")}
                          </Badge>
                        ) : p.status === "local" ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-sky-500 border-sky-500/30 bg-sky-500/10"
                          >
                            {t("settings.badgeLocal")}
                          </Badge>
                        ) : p.hasKey ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30"
                          >
                            <Check className="mr-1 size-3" /> {t("settings.savedKeyBadge")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer"
                          >
                            {t("settings.needKey")}
                          </Badge>
                        )}

                        <span className="text-[11px] text-muted-foreground">
                          {onlyFree ? t("settings.freeCount", { count: p.models.filter((m) => m.free && !m.deprecated).length }) : t("settings.modelsCount", { count: p.models.length })}
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
              {t("settings.keysNotice")} <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">~/.config/klodex/config.jsonc</code>
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t("settings.searchProvider")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Keys & Endpoints List */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1 chat-scroll">
              {keyProviders.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
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
                              <Check className="size-3" /> {t("settings.savedKeyBadge")}
                            </Badge>
                          ) : p.hasKey ? (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/30"
                            >
                              <Check className="mr-1 size-3" /> {lang === "ru" ? "Подключен" : "Connected"}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] text-muted-foreground border-border"
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
                                ? (p.hasKey ? (lang === "ru" ? "•••••••••••••••• (аккаунт подключен)" : "•••••••••••••••• (account connected)") : (lang === "ru" ? "email:password или токен ADCode" : "email:password or ADCode token"))
                                : (p.hasKey ? (lang === "ru" ? "•••••••••••••••• (ключ сохранён)" : "•••••••••••••••• (key saved)") : t("settings.enterKey"))
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
                          {isSaving ? (lang === "ru" ? "Сохранение…" : "Saving…") : t("settings.saveKey")}
                        </Button>
                      </div>

                      {/* Special ADCode Auth Card */}
                      {p.id === "tagflow" && (
                        <div className="pt-2 border-t border-border/40 space-y-2">
                          <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                            <span>{lang === "ru" ? "Быстрая авторизация / Регистрация ADCode (1M токенов/день)" : "Quick Authorization / ADCode Registration (1M tokens/day)"}</span>
                            {p.hasKey && (
                              <span className="text-emerald-500 text-[10px] flex items-center gap-1 font-mono">
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
                      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 w-16">
                          <Globe className="size-3 text-muted-foreground" />
                          <span>Base URL:</span>
                        </div>
                        <Input
                          type="text"
                          placeholder={p.baseURL ? `${lang === "ru" ? "Текущий" : "Current"}: ${p.baseURL}` : "https://api.example.com/v1"}
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
        )}

        {/* Tab 3: Agent Parameters & Environment */}
        {tab === "agent" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 gap-4 chat-scroll">
            {/* 1. Поведение агента */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Sliders className="size-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">{t("settings.agentBehavior")}</h3>
              </div>

              {/* Максимум шагов */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.maxStepsTitle")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.maxStepsSubtitle")}
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
                  <div className="text-xs font-medium text-foreground">{t("settings.reasoningTitle")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.reasoningSubtitle")}
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
                    {t("settings.expanded")}
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
                    {t("settings.collapsed")}
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Субагенты и Swarm */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Workflow className="size-4 text-sky-400" />
                <h3 className="text-xs font-semibold text-foreground">{t("settings.subagentsTitle")}</h3>
              </div>

              {/* Шагов на субагента */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.subagentStepsTitle")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.subagentStepsSubtitle")}
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
                  {t("settings.subagentRoleModels")}
                </div>
                {[
                  {
                    role: "explore",
                    name: "Explore",
                    desc: t("settings.subagentExploreDesc"),
                    val: subagentExplore,
                    setVal: setSubagentExplore,
                  },
                  {
                    role: "coder",
                    name: "Coder",
                    desc: t("settings.subagentCoderDesc"),
                    val: subagentCoder,
                    setVal: setSubagentCoder,
                  },
                  {
                    role: "tester",
                    name: "Tester",
                    desc: t("settings.subagentTesterDesc"),
                    val: subagentTester,
                    setVal: setSubagentTester,
                  },
                  {
                    role: "general",
                    name: "General",
                    desc: t("settings.subagentGeneralDesc"),
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
                      <Select
                        value={item.val || "__default__"}
                        onValueChange={(v) => item.setVal(v === "__default__" ? "" : v)}
                      >
                        <SelectTrigger className="h-7 min-w-[190px] max-w-[280px] text-xs font-mono bg-background">
                          <SelectValue placeholder={t("settings.subagentInherit")} />
                        </SelectTrigger>
                        <SelectContent align="end" className="max-h-[300px] chat-scroll text-xs">
                          <SelectItem value="__default__" className="text-xs text-muted-foreground">
                            {t("settings.subagentInherit")}
                          </SelectItem>
                          {availableSubagentModels.map((m) => (
                            <SelectItem key={`${item.role}-${m.id}`} value={m.id} className="text-xs font-mono">
                              <span className="truncate">{m.providerName} / {m.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.val && (
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          onClick={() => item.setVal("")}
                          className="size-7 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                          title={t("settings.resetToDefault")}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
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
                  <h3 className="text-xs font-semibold text-foreground">{t("settings.systemInstructions")}</h3>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {systemPrompt.length} {lang === "ru" ? "симв." : "chars"}
                </span>
              </div>

              {/* Пресеты */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1">{t("settings.presets")}</span>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      lang === "ru"
                        ? "Пиши только чистый рабочий код без лишних пояснений, воды и вежливых вступлений. Не меняй форматирование нетронутых строк. Не добавляй комментарии 'добавьте код сюда'."
                        : "Write clean, production-ready code with no conversational filler or apologies. Preserve formatting on untouched lines. Never add placeholders.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  {t("settings.presetConcise")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      lang === "ru"
                        ? "Анализируй архитектурные риски перед написанием кода. Указывай на скрытые грабли, избегай оверинжиниринга. Предлагай самые надежные и минимальные решения."
                        : "Analyze architectural risks before writing code. Flag hidden edge cases, prevent overengineering. Recommend robust, minimal implementations.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  {t("settings.presetArchitect")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSystemPrompt(
                      lang === "ru"
                        ? "Перед любыми правками тщательно исследуй кодовую базу, проверяй типы и зависимости. Убедись в обратной совместимости."
                        : "Thoroughly inspect codebase before edits, verifying strict types and dependencies. Ensure backwards compatibility.",
                    )
                  }
                  className="px-2 py-0.5 text-[11px] rounded border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
                >
                  {t("settings.presetAudit")}
                </button>
                {systemPrompt && (
                  <button
                    type="button"
                    onClick={() => setSystemPrompt("")}
                    className="px-2 py-0.5 text-[11px] rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                  >
                    {t("settings.clear")}
                  </button>
                )}
              </div>

              <Textarea
                rows={4}
                placeholder={t("settings.systemPromptPlaceholder")}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="text-xs leading-relaxed font-mono resize-y"
              />
            </div>

            {/* 4. Интерфейс и интеграции */}
            <div className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                <Laptop className="size-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-foreground">{t("settings.interfaceAndEnv")}</h3>
              </div>

              {/* Language Selector */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.language")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("settings.languageDesc")}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLang("en")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer",
                      lang === "en"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>🇬🇧 English</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang("ru")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer",
                      lang === "ru"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>🇷🇺 Русский</span>
                  </button>
                </div>
              </div>

              {/* Тема */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.theme")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("settings.themeDesc")}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[
                    { id: "dark", label: t("settings.themeDark"), icon: Moon },
                    { id: "light", label: t("settings.themeLight"), icon: Sun },
                    { id: "system", label: t("settings.themeSystem"), icon: Laptop },
                  ].map((tTheme) => {
                    const Icon = tTheme.icon;
                    const isCur = theme === tTheme.id;
                    return (
                      <button
                        key={tTheme.id}
                        type="button"
                        onClick={() => {
                          setTheme(tTheme.id as any);
                          applyTheme(tTheme.id as any);
                          localStorage.setItem("klodex_theme", tTheme.id);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer",
                          isCur
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                        <span>{tTheme.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* OpenCode */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div>
                  <div className="text-xs font-medium text-foreground">{t("settings.openCodeImport")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.openCodeImportDesc")}
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
                  <div className="text-xs font-medium text-foreground">{t("settings.autoUpdates")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.autoUpdatesDesc")}
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
              {t("settings.saveShortcut")}
            </div>
          </div>
        )}

        {/* Tab: Token Usage & Stats */}
        {tab === "stats" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 gap-5 chat-scroll">
            {/* Top KPI Cards (5 columns) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Card 1: Total Tokens */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-medium">{t("stats.totalTokens")}</span>
                  <Coins className="size-3.5 text-primary" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {formatTokensNumber(tokenStats?.total?.totalTokens ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {t("stats.inputOutput", { prompt: formatTokensNumber(tokenStats?.total?.promptTokens ?? 0), completion: formatTokensNumber(tokenStats?.total?.completionTokens ?? 0) })}
                </div>
              </div>

              {/* Card 2: Today */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-medium">{t("stats.today")}</span>
                  <Clock className="size-3.5 text-emerald-400" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {formatTokensNumber(tokenStats?.today?.totalTokens ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {t("stats.callsCount", { count: tokenStats?.today?.requests ?? 0 })}
                </div>
              </div>

              {/* Card 3: Week */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-medium">{t("stats.week")}</span>
                  <TrendingUp className="size-3.5 text-sky-400" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {formatTokensNumber(tokenStats?.thisWeek?.totalTokens ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {t("stats.callsCount", { count: tokenStats?.thisWeek?.requests ?? 0 })}
                </div>
              </div>

              {/* Card 4: Requests & Average */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-medium">{t("stats.totalCalls")}</span>
                  <Database className="size-3.5 text-violet-400" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {tokenStats?.total?.requests ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  ~{formatTokensNumber(Math.round((tokenStats?.total?.totalTokens ?? 0) / Math.max(1, tokenStats?.total?.requests ?? 1)))} / {lang === "ru" ? "вызов" : "call"}
                </div>
              </div>

              {/* Card 5: Compact Saved Tokens */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5 shadow-xs col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] font-medium text-amber-500/90">{t("stats.compactSaved")}</span>
                  <Minimize2 className="size-3.5 text-amber-500" />
                </div>
                <div className="text-xl font-bold font-mono tracking-tight text-foreground">
                  {formatTokensNumber(tokenStats?.compact?.tokensPruned ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {t("stats.compactSub", { msgs: tokenStats?.compact?.droppedMessages ?? 0, compactions: tokenStats?.compact?.compactions ?? 0 })}
                </div>
              </div>
            </div>

            {/* Middle Grid: Providers distribution & Top Models */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Providers breakdown */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{t("stats.byProvider")}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t("stats.activeProviders", { count: tokenStats?.byProvider?.length ?? 0 })}
                  </span>
                </div>

                {(!tokenStats?.byProvider || tokenStats.byProvider.length === 0) ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {t("stats.noData")}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[180px] overflow-y-auto chat-scroll pr-1">
                    {tokenStats.byProvider.map((p) => (
                      <div key={p.provider} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground truncate">{p.provider}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatTokensNumber(p.totalTokens)} ({p.percentage}%)
                          </span>
                        </div>
                        <Progress value={p.percentage} className="h-1.5" />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground/75 font-mono">
                          <span>{t("stats.inputOutput", { prompt: formatTokensNumber(p.promptTokens), completion: formatTokensNumber(p.completionTokens) })}</span>
                          <span>{t("stats.callsCount", { count: p.requests })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top models breakdown */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{t("stats.byModel")}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {t("stats.modelsCount", { count: tokenStats?.byModel?.length ?? 0 })}
                  </span>
                </div>

                {(!tokenStats?.byModel || tokenStats.byModel.length === 0) ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {t("stats.noData")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[180px] overflow-y-auto chat-scroll pr-1">
                    {tokenStats.byModel.slice(0, 8).map((m) => (
                      <div
                        key={`${m.provider}/${m.model}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50 text-xs gap-2"
                      >
                        <div className="min-w-0 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono shrink-0">
                            {m.provider}
                          </Badge>
                          <span className="font-mono text-[11px] truncate text-foreground" title={m.model}>
                            {m.model}
                          </span>
                        </div>
                        <div className="text-right shrink-0 font-mono text-[11px]">
                          <span className="font-semibold text-foreground">{formatTokensNumber(m.totalTokens)}</span>
                          <span className="text-muted-foreground text-[10px] ml-1.5">({t("stats.callsCount", { count: m.requests })})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Recent calls log */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{t("stats.recent")}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                    {t("stats.recordsCount", { count: tokenStats?.recent?.length ?? 0 })}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {t("stats.sqliteDb")}
                </span>
              </div>

              {(!tokenStats?.recent || tokenStats.recent.length === 0) ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {t("stats.logEmpty")}
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="max-h-[220px] overflow-y-auto chat-scroll">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-muted/60 text-[10px] font-mono text-muted-foreground uppercase tracking-wider sticky top-0 backdrop-blur-xs z-10 border-b border-border/60">
                        <tr>
                          <th className="py-2 px-3">{t("stats.colTime")}</th>
                          <th className="py-2 px-3">{t("stats.colModel")}</th>
                          <th className="py-2 px-3 text-right">{t("stats.colPrompt")}</th>
                          <th className="py-2 px-3 text-right">{t("stats.colCompletion")}</th>
                          <th className="py-2 px-3 text-right">{t("stats.colTotal")}</th>
                          <th className="py-2 px-3 text-right">{t("stats.colDuration")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                        {tokenStats.recent.map((rec) => (
                          <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap text-[10px]">
                              {new Date(rec.createdAt).toLocaleTimeString(lang === "ru" ? "ru" : "en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </td>
                            <td className="py-1.5 px-3 max-w-[200px] truncate" title={`${rec.provider}/${rec.model}`}>
                              <span className="text-muted-foreground text-[10px] mr-1">{rec.provider}/</span>
                              <span className="text-foreground font-medium">{rec.model}</span>
                            </td>
                            <td className="py-1.5 px-3 text-right text-muted-foreground">
                              {rec.promptTokens.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right text-muted-foreground">
                              {rec.completionTokens.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-foreground">
                              {rec.totalTokens.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right text-muted-foreground text-[10px]">
                              {rec.durationMs > 0 ? `${(rec.durationMs / 1000).toFixed(1)}${lang === "ru" ? "с" : "s"}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Updates & Maintenance */}
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
                {checkingUpdate ? t("updates.checking") : t("updates.checkBtn")}
              </Button>
            </div>

            {/* Active Update / Restart Progress Card */}
            {(applyingUpdate || restartingServer) && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <Loader2 className={cn("size-4 animate-spin", restartingServer ? "text-emerald-400" : "text-primary")} />
                    <span>{restartingServer ? t("updates.restarting") : updatePhase || t("updates.checking")}</span>
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
                    { label: t("updates.step1"), target: 30 },
                    { label: t("updates.step2"), target: 65 },
                    { label: t("updates.step3"), target: 88 },
                    { label: t("updates.step4"), target: 100 },
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
                    ? t("toast.restartDesc")
                    : t("toast.applyingDesc")}
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
                          {t("updates.available")}
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
                        {updateStatus.message || t("toast.defaultMessage")}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="h-9 px-4 gap-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer shrink-0"
                      onClick={handleApplyUpdate}
                    >
                      <Download className="size-3.5" />
                      <span>{t("updates.applyWithRestart")}</span>
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
                        <span>{t("updates.upToDate")}</span>
                        {updateStatus?.currentVersion && (
                          <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 h-4">
                            v{updateStatus.currentVersion}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {lang === "ru" ? "Все модули, модели и тулы обновлены до последней стабильной ревизии." : "All modules, models, and tools are updated to the latest stable revision."}
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
                  <span className="font-semibold block text-foreground">{t("updates.gitMissing")}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("updates.gitMissingDesc")}
                  </span>
                </div>
              </div>
            )}

            {/* Release notes / Commits log */}
            {updateStatus?.releaseNotes && !applyingUpdate && !restartingServer && (
              <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span>{t("updates.recentCommits")}</span>
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
                  <span>{t("updates.buildLog")}</span>
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
                            <span className="text-emerald-400">{t("common.copied")}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>{t("updates.copyLog")}</span>
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
                <span className="text-xs font-semibold block text-foreground">{t("settings.onboardingHero")}</span>
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("settings.onboardingHeroDesc")}
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
                {t("settings.launchOnboarding")}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
