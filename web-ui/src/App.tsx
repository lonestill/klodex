import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Settings2, Trash2, Pencil } from "lucide-react";

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
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState("");

  /** Open settings, optionally focusing a specific tab (e.g. "updates" from the toast). */
  const openSettings = (tab: SettingsTab = "provider") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const loadCatalog = useCallback(async (refresh = false) => {
    try {
      const res = await api.catalog(refresh);
      const data = Array.isArray(res?.providers) ? res.providers : [];
      if (data.length === 0) return;
      setCatalog(data);

      // Fetch backend settings to check defaultProvider / defaultModel if any
      const backendSettings = await api.settings().catch(() => null);

      setSelected((prev) => {
        // 1. If currently selected model is still valid in catalog, keep it
        if (prev) {
          const stillProvider = data.find((p) => p.id === prev.provider);
          const stillModel = Array.isArray(stillProvider?.models)
            ? stillProvider.models.find((m) => m.id === prev.model)
            : undefined;
          if (stillProvider && stillModel) return prev;
        }

        // 2. If user saved a model in localStorage, keep it
        const saved = localStorage.getItem("klodex_model");
        if (saved && saved.includes("/")) {
          const [provId, ...rest] = saved.split("/");
          const modelId = rest.join("/");
          const p = data.find((x) => x.id === provId);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === modelId) : undefined;
          if (p && m) return { provider: p.id, model: m.id };
        }

        // 3. If user configured defaultProvider/defaultModel in settings, keep it
        if (backendSettings?.defaultProvider && backendSettings?.defaultModel) {
          const p = data.find((x) => x.id === backendSettings.defaultProvider);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === backendSettings.defaultModel) : undefined;
          if (p && m) {
            localStorage.setItem("klodex_model", modelKey(p.id, m.id));
            return { provider: p.id, model: m.id };
          }
        }

        // 4. Initial fallback ONLY when user has never chosen any model
        const pick =
          data.find((p) => (p.status === "ready" || p.status === "keyless" || p.status === "local") && Array.isArray(p.models) && p.models.length > 0) ??
          data.find((p) => Array.isArray(p.models) && p.models.length > 0);

        if (pick && Array.isArray(pick.models) && pick.models[0]) {
          const chosen = { provider: pick.id, model: pick.models[0].id };
          localStorage.setItem("klodex_model", modelKey(chosen.provider, chosen.model));
          return chosen;
        }

        return null;
      });
    } catch (err) {
      console.error("[catalog] Failed to load catalog:", err);
    }
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
      if (s.firstRunCompleted === false) {
        localStorage.removeItem("klodex_onboarding_done");
        setOnboardingOpen(true);
      }
    }).catch(() => {});

    const openSettingsEvent = () => openSettings();
    const openOnboarding = () => setOnboardingOpen(true);
    const openCatalog = () => setMainView("catalog");
    const onNewSession = () => setMainView("chat");

    const onTitleUpdated = (e: any) => {
      const { id, title } = e.detail || {};
      if (id && title) {
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
      }
    };

    window.addEventListener("klodex:openSettings", openSettingsEvent);
    window.addEventListener("klodex:openOnboarding", openOnboarding);
    window.addEventListener("klodex:openCatalog", openCatalog);
    window.addEventListener("klodex:newSession", onNewSession);
    window.addEventListener("klodex:sessionTitleUpdated", onTitleUpdated);

    return () => {
      window.removeEventListener("klodex:openSettings", openSettingsEvent);
      window.removeEventListener("klodex:openOnboarding", openOnboarding);
      window.removeEventListener("klodex:openCatalog", openCatalog);
      window.removeEventListener("klodex:newSession", onNewSession);
      window.removeEventListener("klodex:sessionTitleUpdated", onTitleUpdated);
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
                      ? "bg-muted text-foreground font-semibold border border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  title="Каталог скиллов и промптов"
                >
                  <Boxes className="size-4 shrink-0 text-foreground" />
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
                  <SidebarMenuItem key={s.id} className="relative group/session">
                    {editingSessionId === s.id ? (
                      <div className="flex items-center gap-1 px-2 py-1 w-full">
                        <input
                          autoFocus
                          type="text"
                          value={editSessionTitle}
                          onChange={(e) => setEditSessionTitle(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const trimmed = editSessionTitle.trim();
                              setEditingSessionId(null);
                              if (trimmed && trimmed !== s.title) {
                                await api.updateSession(s.id, { title: trimmed });
                                setSessions((prev) =>
                                  prev.map((item) => (item.id === s.id ? { ...item, title: trimmed } : item)),
                                );
                                window.dispatchEvent(
                                  new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: s.id, title: trimmed } }),
                                );
                              }
                            } else if (e.key === "Escape") {
                              setEditingSessionId(null);
                            }
                          }}
                          onBlur={async () => {
                            const trimmed = editSessionTitle.trim();
                            setEditingSessionId(null);
                            if (trimmed && trimmed !== s.title) {
                              await api.updateSession(s.id, { title: trimmed });
                              setSessions((prev) =>
                                prev.map((item) => (item.id === s.id ? { ...item, title: trimmed } : item)),
                              );
                              window.dispatchEvent(
                                new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: s.id, title: trimmed } }),
                              );
                            }
                          }}
                          className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    ) : (
                      <>
                        <SidebarMenuButton
                          className={cn(
                            "justify-start text-xs pr-14",
                            activeSessionId === s.id && mainView === "chat" && "bg-accent text-accent-foreground font-medium",
                          )}
                          isActive={activeSessionId === s.id && mainView === "chat"}
                          onClick={() => {
                            setMainView("chat");
                            window.dispatchEvent(
                              new CustomEvent("klodex:openSession", { detail: s.id }),
                            );
                          }}
                          onDoubleClick={() => {
                            setEditingSessionId(s.id);
                            setEditSessionTitle(s.title ?? "");
                          }}
                        >
                          <span className="truncate">{s.title ?? s.id.slice(0, 8)}</span>
                          {activeSessionIds.includes(s.id) && (
                            <span className="relative flex h-2 w-2 shrink-0 ml-1.5" title="Генерирует ответ…">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-muted-foreground mr-1">
                            {new Date(s.updated_at).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" })}
                          </span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          className="right-6"
                          showOnHover
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(s.id);
                            setEditSessionTitle(s.title ?? "");
                          }}
                          title="Переименовать"
                        >
                          <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
                        </SidebarMenuAction>
                        <SidebarMenuAction
                          className="right-1"
                          showOnHover
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
                      </>
                    )}
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
