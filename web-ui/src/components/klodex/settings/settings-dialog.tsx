import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Cpu,
  Download,
  Heart,
  Key,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { ChangelogDialog } from "@/components/klodex/changelog-dialog";
import { SponsorDialog } from "@/components/klodex/sponsor-dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  api,
  type FullTokenStatsReport,
  type KlodexSettings,
  type ProviderSort,
  type UpdateStatus,
} from "@/lib/api";

import {
  applyTheme,
  type SettingsDialogProps,
  type SettingsTab,
  type TabConfigItem,
} from "./types";
import { GeneralTab } from "./general-tab";
import { ProvidersTab } from "./providers-tab";
import { KeysTab } from "./keys-tab";
import { AgentTab } from "./agent-tab";
import { StatsTab } from "./stats-tab";
import { UpdatesTab } from "./updates-tab";

export function SettingsDialog({
  open,
  onOpenChange,
  catalog,
  onCatalogRefresh,
  selected,
  onSelectedChange,
  initialTab,
}: SettingsDialogProps) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? "general");
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);

  const tabConfig = useMemo<TabConfigItem[]>(
    () => [
      {
        id: "general",
        label: t("settings.tabGeneral"),
        title: t("settings.tabGeneral"),
        description: t("settings.tabGeneralDesc"),
        icon: Settings,
      },
      {
        id: "provider",
        label: t("settings.tabProvider"),
        title: t("settings.tabProvider"),
        description: t("settings.tabProviderDesc"),
        icon: Cpu,
      },
      {
        id: "keys",
        label: t("settings.tabKeys"),
        title: t("settings.tabKeys"),
        description: t("settings.tabKeysDesc"),
        icon: Key,
      },
      {
        id: "agent",
        label: t("settings.tabAgent"),
        title: t("settings.tabAgent"),
        description: t("settings.tabAgentDesc"),
        icon: Sliders,
      },
      {
        id: "stats",
        label: t("settings.tabStats"),
        title: t("settings.tabStats"),
        description: t("settings.tabStatsDesc"),
        icon: BarChart3,
      },
      {
        id: "updates",
        label: t("settings.tabUpdates"),
        title: t("settings.tabUpdates"),
        description: t("settings.tabUpdatesDesc"),
        icon: Download,
      },
    ],
    [t],
  );

  /* Search & Filter state */
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<ProviderSort>(() => {
    return (localStorage.getItem("klodex_providerSort") as ProviderSort) || "category";
  });
  const [onlyFree, setOnlyFree] = useState<boolean>(() => {
    return localStorage.getItem("klodex_only_free") === "true";
  });

  /* Keys & URL drafts */
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [savedKeyBadge, setSavedKeyBadge] = useState<Record<string, boolean>>({});
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [savingUrl, setSavingUrl] = useState<Record<string, boolean>>({});
  const [savedUrlBadge, setSavedUrlBadge] = useState<Record<string, boolean>>({});

  /* General & Agent options */
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    return (localStorage.getItem("klodex_theme") as "dark" | "light" | "system") || "dark";
  });
  const [importOpenCode, setImportOpenCode] = useState(true);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(() => {
    return localStorage.getItem("klodex_show_telemetry") !== "false";
  });

  const handleSetShowTelemetry = (v: boolean) => {
    setShowTelemetry(v);
    localStorage.setItem("klodex_show_telemetry", String(v));
    window.dispatchEvent(new CustomEvent("klodex:telemetryChanged", { detail: { enabled: v } }));
  };
  const [maxSteps, setMaxSteps] = useState(64);
  const [maxSubagentSteps, setMaxSubagentSteps] = useState(32);
  const [reasoningOpen, setReasoningOpen] = useState(() => {
    return localStorage.getItem("klodex_reasoning_default_open") === "true";
  });
  const [subagentExplore, setSubagentExplore] = useState("");
  const [subagentCoder, setSubagentCoder] = useState("");
  const [subagentTester, setSubagentTester] = useState("");
  const [subagentGeneral, setSubagentGeneral] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  /* Saving feedback */
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettingsSuccess, setSavedSettingsSuccess] = useState(false);

  /* Token Stats */
  const [tokenStats, setTokenStats] = useState<FullTokenStatsReport | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [clearingStats, setClearingStats] = useState(false);
  const [confirmClearStats, setConfirmClearStats] = useState(false);

  /* Updates */
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

  /* Stats loader */
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

  /* Listeners & initial loads */
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

      void api.updateStatus().then(setUpdateStatus).catch(() => {});
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open && tab === "stats") {
      void loadTokenStats();
    }
  }, [open, tab, loadTokenStats]);

  /* Save Key action */
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

  /* Save Base URL action */
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

  /* Save Settings action */
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

  /* Close handler saves settings automatically */
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
      localStorage.setItem("klodex_reasoning_default_open", String(reasoningOpen));
      localStorage.setItem("klodex_providerSort", sortMode);
      localStorage.setItem("klodex_theme", theme);
      applyTheme(theme);
      window.dispatchEvent(
        new CustomEvent("klodex:reasoningDefaultChanged", { detail: reasoningOpen }),
      );
    }
    onOpenChange(isOpen);
  };

  /* Updates handlers */
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
        localStorage.removeItem("klodex_v2_intro_seen");
        localStorage.removeItem("klodex_v2_intro_seen_v200");
        setUpdateProgress(100);
        setUpdateDone(true);
        setRestartingServer(true);
        setUpdatePhase(t("updates.restarting"));

        let attempts = 0;
        const maxAttempts = 60;
        const pollTimer = setInterval(async () => {
          attempts++;
          try {
            const probe = await fetch("/api/update/status", { cache: "no-store" });
            if (probe.ok) {
              clearInterval(pollTimer);
              setTimeout(() => {
                window.location.reload();
              }, 600);
            }
          } catch {
            if (attempts >= maxAttempts) {
              clearInterval(pollTimer);
              setRestartingServer(false);
              setUpdateMessage(t("updates.manualRestart"));
            }
          }
        }, 1200);
      } else {
        setUpdateProgress(0);
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      setUpdateMessage(`${t("toast.error")}: ${err.message ?? String(err)}`);
      setUpdateProgress(0);
    } finally {
      setApplyingUpdate(false);
    }
  };

  const handleCopyLog = async () => {
    if (!updateLog) return;
    try {
      await navigator.clipboard.writeText(updateLog);
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 2000);
    } catch {
      /* ignore */
    }
  };

  /* Shortcut Cmd+S / Ctrl+S */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (open && (tab === "general" || tab === "agent")) {
          e.preventDefault();
          void handleSaveSettings();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, tab, maxSteps, maxSubagentSteps, systemPrompt, sortMode, importOpenCode, autoCheckUpdates, subagentExplore, subagentCoder, subagentTester, subagentGeneral, reasoningOpen, theme]);

  const activeTabMeta = tabConfig.find((tc) => tc.id === tab);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[660px] max-h-[92vh] w-[960px] max-w-[95vw] sm:max-w-[960px] flex-row gap-0 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        {/* Left Sidebar */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border/60 bg-card/50 backdrop-blur-md">
          {/* Brand Header */}
          <DialogHeader className="border-b border-border/60 p-4.5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-xs">
                <KlodexIcon size={20} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-base font-semibold tracking-tight text-foreground">
                  {t("settings.title")}
                </DialogTitle>
                <DialogDescription className="truncate font-mono text-[11px] text-muted-foreground">
                  klodex v{updateStatus?.currentVersion ?? "0.1"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Navigation Tab List */}
          <nav className="chat-scroll flex-1 space-y-1 overflow-y-auto p-3">
            {tabConfig.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium transition-all text-left",
                    isActive
                      ? "border border-primary/25 bg-primary/15 font-semibold text-primary shadow-xs ring-1 ring-primary/20"
                      : "border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.id === "updates" && updateStatus?.hasUpdate && (
                    <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sponsor / Support Author */}
          <div className="px-3 pb-2 pt-0.5">
            <button
              type="button"
              onClick={() => setSponsorOpen(true)}
              className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-medium text-rose-300/90 transition-all hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-200 text-left shadow-2xs"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Heart className="size-3.5 shrink-0 text-rose-400 fill-rose-500/20 group-hover:scale-110 transition-transform" />
                <span className="truncate">{t("sponsor.btn")}</span>
              </div>
              <span className="text-[10px] font-mono text-rose-400/70 group-hover:text-rose-300 transition-colors">
                @lonestill
              </span>
            </button>
          </div>

          {/* Sidebar Footer */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 p-3.5 font-mono text-[10px] text-muted-foreground">
            <span>{t("settings.providersCount", { count: catalog.length })}</span>
            <span>
              {t("settings.modelsCount", {
                count: catalog.reduce((acc, p) => acc + p.models.length, 0),
              })}
            </span>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex min-w-0 flex-1 flex-col bg-background/40">
          {/* Header Bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-card/30 px-6 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                {activeTabMeta?.title}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeTabMeta?.description}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Add Custom Provider Button for provider tab */}
              {tab === "provider" && (
                <Button
                  size="sm"
                  onClick={() => window.dispatchEvent(new Event("klodex:openCustomProviderDialog"))}
                  className="h-8 gap-1.5 px-3 text-xs font-medium cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                >
                  <Plus className="size-3.5" />
                  <span>{lang === "ru" ? "Свой провайдер" : "Add Provider"}</span>
                </Button>
              )}

              {/* Save Settings Button for general and agent tabs */}
              {(tab === "agent" || tab === "general") && (
                <Button
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 px-3 text-xs font-medium shadow-xs cursor-pointer transition-all",
                    savedSettingsSuccess
                      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                  onClick={() => void handleSaveSettings()}
                  disabled={savingSettings}
                >
                  {savedSettingsSuccess ? (
                    <>
                      <Check className="size-3.5" />
                      <span>{t("settings.saved")}</span>
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5" />
                      <span>{savingSettings ? t("common.saving") : t("settings.saveSettings")}</span>
                    </>
                  )}
                </Button>
              )}

              {/* Stats Clear and Refresh Buttons */}
              {tab === "stats" && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs border-border/60 bg-card/40 hover:bg-card cursor-pointer"
                    onClick={() => void loadTokenStats()}
                    disabled={loadingStats}
                    title={t("common.refresh")}
                  >
                    <RotateCcw className={cn("size-3.5", loadingStats && "animate-spin")} />
                  </Button>

                  {confirmClearStats ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs cursor-pointer px-2.5"
                        onClick={() => void handleClearStats()}
                        disabled={clearingStats}
                      >
                        {clearingStats ? t("common.saving") : t("stats.clearConfirm")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs cursor-pointer px-2"
                        onClick={() => setConfirmClearStats(false)}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-destructive border-border/60 bg-card/40 hover:border-destructive/40 cursor-pointer"
                      onClick={() => setConfirmClearStats(true)}
                    >
                      <Trash2 className="size-3.5" />
                      <span>{t("stats.clearHistory")}</span>
                    </Button>
                  )}
                </div>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("common.close")}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Active Tab View */}
          {tab === "general" && (
            <GeneralTab
              theme={theme}
              setTheme={setTheme}
              importOpenCode={importOpenCode}
              setImportOpenCode={setImportOpenCode}
              autoCheckUpdates={autoCheckUpdates}
              setAutoCheckUpdates={setAutoCheckUpdates}
              showTelemetry={showTelemetry}
              setShowTelemetry={handleSetShowTelemetry}
            />
          )}

          {tab === "provider" && (
            <ProvidersTab
              catalog={catalog}
              selected={selected}
              onSelectedChange={onSelectedChange}
              search={search}
              setSearch={setSearch}
              sortMode={sortMode}
              setSortMode={setSortMode}
              onlyFree={onlyFree}
              setOnlyFree={setOnlyFree}
              onGoToKeys={(name) => {
                setTab("keys");
                setSearch(name);
              }}
              onCatalogRefresh={onCatalogRefresh}
            />
          )}

          {tab === "keys" && (
            <KeysTab
              catalog={catalog}
              search={search}
              setSearch={setSearch}
              keyDrafts={keyDrafts}
              setKeyDrafts={setKeyDrafts}
              showKey={showKey}
              setShowKey={setShowKey}
              savingKey={savingKey}
              savedKeyBadge={savedKeyBadge}
              saveKey={saveKey}
              urlDrafts={urlDrafts}
              setUrlDrafts={setUrlDrafts}
              savingUrl={savingUrl}
              savedUrlBadge={savedUrlBadge}
              saveBaseUrl={saveBaseUrl}
              onCatalogRefresh={onCatalogRefresh}
            />
          )}

          {tab === "agent" && (
            <AgentTab
              catalog={catalog}
              maxSteps={maxSteps}
              setMaxSteps={setMaxSteps}
              maxSubagentSteps={maxSubagentSteps}
              setMaxSubagentSteps={setMaxSubagentSteps}
              reasoningOpen={reasoningOpen}
              setReasoningOpen={setReasoningOpen}
              subagentExplore={subagentExplore}
              setSubagentExplore={setSubagentExplore}
              subagentCoder={subagentCoder}
              setSubagentCoder={setSubagentCoder}
              subagentTester={subagentTester}
              setSubagentTester={setSubagentTester}
              subagentGeneral={subagentGeneral}
              setSubagentGeneral={setSubagentGeneral}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
            />
          )}

          {tab === "stats" && (
            <StatsTab tokenStats={tokenStats} loadingStats={loadingStats} />
          )}

          {tab === "updates" && (
            <UpdatesTab
              updateStatus={updateStatus}
              checkingUpdate={checkingUpdate}
              applyingUpdate={applyingUpdate}
              restartingServer={restartingServer}
              updateDone={updateDone}
              updateProgress={updateProgress}
              updatePhase={updatePhase}
              updateLog={updateLog}
              updateMessage={updateMessage}
              showUpdateLog={showUpdateLog}
              setShowUpdateLog={setShowUpdateLog}
              copiedLog={copiedLog}
              handleCheckUpdate={handleCheckUpdate}
              handleApplyUpdate={handleApplyUpdate}
              handleCopyLog={handleCopyLog}
              onOpenChangelog={() => setChangelogOpen(true)}
              onOpenOnboarding={() => {
                onOpenChange(false);
                window.dispatchEvent(new Event("klodex:openOnboarding"));
              }}
            />
          )}
        </div>
      </DialogContent>

      {/* Changelog Dialog child */}
      <ChangelogDialog
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
        status={updateStatus}
      />

      {/* Sponsor Dialog child */}
      <SponsorDialog
        open={sponsorOpen}
        onOpenChange={setSponsorOpen}
      />
    </Dialog>
  );
}
