import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Settings2, Sparkles, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { api, modelKey, type KlodexProvider, type KlodexSettings, type ProviderSort, type SessionRow, type UpdateStatus } from "@/lib/api";
import { KlodexChat } from "@/components/klodex/klodex-chat";
import { SettingsDialog, type SettingsTab } from "@/components/klodex/settings-dialog";
import { UpdateToast } from "@/components/klodex/update-toast";
import { OnboardingWizard } from "@/components/klodex/onboarding-wizard";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { CatalogView } from "@/components/klodex/catalog-view";

export function App() {
  const [catalog, setCatalog] = useState<KlodexProvider[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [selected, setSelected] = useState<{ provider: string; model: string } | null>(null);
  const [mainView, setMainView] = useState<"chat" | "catalog">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("provider");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(() =>
    localStorage.getItem("klodex_update_dismissed"),
  );
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);
  const [providerSort, setProviderSort] = useState<ProviderSort>(() => {
    const saved = localStorage.getItem("klodex_providerSort") as ProviderSort | null;
    return saved ?? "category";
  });

  /** Open settings, optionally focusing a specific tab (e.g. "updates" from the toast). */
  const openSettings = (tab: SettingsTab = "provider") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const loadCatalog = useCallback(async (refresh = false) => {
    const data = (await api.catalog(refresh)).providers;
    setCatalog(data);
    setSelected((prev) => {
      if (prev) {
        const still = data.find(
          (p) => p.id === prev.provider && p.models.some((m) => m.id === prev.model && !m.deprecated),
        );
        if (still) return prev;
      }
      const saved = localStorage.getItem("klodex_model");
      if (saved) {
        const key = modelKey("", saved) === saved ? saved.split("/") : null;
        if (key) {
          const p = data.find((x) => x.id === key[0]);
          const m = p?.models.find((x) => x.id === key[1]);
          if (p && m && !m.deprecated) return { provider: p.id, model: m.id };
        }
      }
      // fallback priority: deepai deepseek -> opencode free deepseek -> any free_keyless -> ready/local -> any
      const deepai = data.find((p) => p.id === "deepai");
      const deepaiDs = deepai?.models.find((m) => m.id === "deepseek-v3.2") ?? deepai?.models[0];
      if (deepai && deepaiDs) return { provider: deepai.id, model: deepaiDs.id };

      const oc = data.find((p) => p.id === "opencode");
      const ocDs = oc?.models.find((m) => m.id === "deepseek-v4.1-flash-free") ?? oc?.models[0];
      if (oc && ocDs) return { provider: oc.id, model: ocDs.id };

      const freePick = data.find((p) => p.category === "free_keyless" && p.models.length);
      if (freePick) return { provider: freePick.id, model: freePick.models[0].id };

      const pick = data.find((p) => (p.status === "ready" || p.status === "keyless" || p.status === "local") && p.models.length) ?? data.find((p) => p.models.length);
      return pick ? { provider: pick.id, model: pick.models[0].id } : null;
    });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.sessions());
    } catch {
      // server offline etc.
    }
  }, []);

  useEffect(() => {
    setProject(localStorage.getItem("klodex_project") ?? "");
    void loadCatalog(false);
    void loadSessions();
    void api.settings().then((s: KlodexSettings) => {
      if (s.providerSort && s.providerSort !== providerSort) {
        setProviderSort(s.providerSort);
        localStorage.setItem("klodex_providerSort", s.providerSort);
      }
      // Launch onboarding wizard on first run
      if (s.firstRunCompleted === false && localStorage.getItem("klodex_onboarding_done") !== "true") {
        setOnboardingOpen(true);
      }
    }).catch(() => {});

    const openSettingsEvent = () => openSettings();
    const openOnboarding = () => setOnboardingOpen(true);
    const openCatalog = () => setMainView("catalog");
    const onNewSession = () => setMainView("chat");

    window.addEventListener("klodex:openSettings", openSettingsEvent);
    window.addEventListener("klodex:openOnboarding", openOnboarding);
    window.addEventListener("klodex:openCatalog", openCatalog);
    window.addEventListener("klodex:newSession", onNewSession);

    return () => {
      window.removeEventListener("klodex:openSettings", openSettingsEvent);
      window.removeEventListener("klodex:openOnboarding", openOnboarding);
      window.removeEventListener("klodex:openCatalog", openCatalog);
      window.removeEventListener("klodex:newSession", onNewSession);
    };
  }, [loadCatalog, loadSessions]);

  // Poll the updater once a minute (same cadence as the server-side watcher) so the
  // bottom-right micro-notification appears as soon as a new commit/release lands.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.updateStatus();
        if (alive) setUpdateStatus(s);
      } catch {
        // server offline / transient — keep the last known status
      }
    };
    void poll();
    const id = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Poll active chat runs to display live pulsing indicators in sidebar
  useEffect(() => {
    let alive = true;
    const pollActive = async () => {
      try {
        const res = await api.activeChat();
        if (alive && "activeSessionIds" in res && Array.isArray(res.activeSessionIds)) {
          setActiveSessionIds(res.activeSessionIds);
        }
      } catch {}
    };
    void pollActive();
    const id = setInterval(pollActive, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const updateKey =
    updateStatus?.hasUpdate
      ? `${updateStatus.updateType ?? "any"}:${updateStatus.latestVersion ?? ""}`
      : null;
  const visibleUpdate = updateKey && updateKey !== dismissedUpdate ? updateStatus : null;

  const dismissUpdate = () => {
    if (!updateKey) return;
    setDismissedUpdate(updateKey);
    localStorage.setItem("klodex_update_dismissed", updateKey);
  };

  const saveProject = (v: string) => {
    setProject(v);
    localStorage.setItem("klodex_project", v);
  };

  return (
    <SidebarProvider className="h-svh max-h-svh overflow-hidden">
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader className="p-3">
          <div className="flex items-center gap-2.5 px-1 text-lg font-bold tracking-tight">
            <KlodexIcon size={20} />
            <span className="group-data-[collapsible=icon]:hidden">klodex</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="pb-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setMainView(mainView === "catalog" ? "chat" : "catalog")}
                  className={cn(
                    "justify-start gap-2.5 font-medium text-xs h-9 px-2.5 rounded-lg transition-colors cursor-pointer",
                    mainView === "catalog"
                      ? "bg-purple-500/15 text-purple-400 font-semibold border border-purple-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  title="Каталог скиллов и промптов"
                >
                  <Sparkles className="size-4 text-purple-400 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">Скиллы и промпты</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>
                Чаты
                {sessions.length > 0 && (
                  <span className="ml-1 text-muted-foreground font-normal">({sessions.length})</span>
                )}
              </span>
              <span
                className="text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => {
                  setMainView("chat");
                  window.dispatchEvent(new Event("klodex:newSession"));
                }}
                title="Новый чат"
              >
                <Plus className="size-4" />
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {sessions.map((s) => (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton
                      className={cn(
                        "justify-start text-xs",
                        activeSessionId === s.id && mainView === "chat" && "bg-accent text-accent-foreground font-medium",
                      )}
                      isActive={activeSessionId === s.id && mainView === "chat"}
                      onClick={() => {
                        setMainView("chat");
                        window.dispatchEvent(
                          new CustomEvent("klodex:openSession", { detail: s.id }),
                        );
                      }}
                    >
                      <span className="truncate">{s.title ?? s.id.slice(0, 8)}</span>
                      {activeSessionIds.includes(s.id) && (
                        <span className="relative flex h-2 w-2 shrink-0 ml-1.5" title="Генерирует ответ…">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(s.updated_at).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Удалить «${s.title ?? s.id.slice(0, 8)}»?`)) return;
                        await api.deleteSession(s.id);
                        if (activeSessionId === s.id) {
                          window.dispatchEvent(new Event("klodex:sessionDeleted"));
                        }
                        void loadSessions();
                      }}
                      title="Удалить"
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
                {!sessions.length && (
                  <div className="px-2 text-muted-foreground text-xs">
                    пока пусто — напиши в поле справа
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3 space-y-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => openSettings()}
                className="justify-start"
                title="Настройки: модель по умолчанию и API-ключи"
              >
                <Settings2 className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">Настройки</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] leading-relaxed group-data-[collapsible=icon]:hidden">
            <KlodexIcon size={12} className="opacity-70" />
            <span>klodex 0.1 · {catalog.length} провайдеров</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex h-svh max-h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2.5 border-b px-2.5 py-1.5 bg-background/50 backdrop-blur-xs">
          <SidebarTrigger />
          <div className="flex items-center gap-1.5 text-foreground/80">
            <KlodexIcon size={14} />
            <span className="text-xs font-semibold tracking-tight">klodex</span>
          </div>
        </div>
        {mainView === "catalog" ? (
          <CatalogView
            projectDir={project}
            selectedModel={selected}
            modelsCatalog={catalog}
            onClose={() => setMainView("chat")}
            onApplyPromptToChat={(slash) => {
              setMainView("chat");
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("klodex:setInputText", { detail: slash }));
              }, 50);
            }}
          />
        ) : (
          <KlodexChat
            catalog={catalog}
            onCatalogRefresh={() => loadCatalog(true)}
            sessions={sessions}
            reloadSessions={loadSessions}
            selected={selected}
            onSelectedChange={(sel) => {
              setSelected(sel);
              localStorage.setItem("klodex_model", modelKey(sel.provider, sel.model));
            }}
            onCurrentSessionChange={setActiveSessionId}
            providerSort={providerSort}
          />
        )}
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialTab={settingsTab}
          catalog={catalog}
          onCatalogRefresh={() => loadCatalog(true)}
          selected={selected}
          onSelectedChange={(sel) => {
            setSelected(sel);
            localStorage.setItem("klodex_model", modelKey(sel.provider, sel.model));
          }}
          providerSort={providerSort}
          onProviderSortChange={(s) => {
            setProviderSort(s);
            localStorage.setItem("klodex_providerSort", s);
          }}
        />
        <OnboardingWizard
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          catalog={catalog}
          onCatalogRefresh={() => loadCatalog(true)}
          onSelectedChange={(sel) => {
            setSelected(sel);
            localStorage.setItem("klodex_model", modelKey(sel.provider, sel.model));
          }}
          defaultProjectDir={project}
        />
        <UpdateToast
          status={visibleUpdate}
          onOpenSettings={() => openSettings("updates")}
          onDismiss={dismissUpdate}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
