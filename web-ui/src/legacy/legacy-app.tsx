import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Settings2, Trash2, Pencil } from "lucide-react";

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
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { api, modelKey, type KlodexProvider, type KlodexSettings, type ProviderSort, type SessionRow, type UpdateStatus } from "@/lib/api";
import { KlodexChat } from "@/components/klodex/klodex-chat";
import { SettingsDialog, type SettingsTab } from "@/components/klodex/settings-dialog";
import { UpdateToast } from "@/components/klodex/update-toast";
import { OnboardingWizard } from "@/components/klodex/onboarding-wizard";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { CatalogView } from "@/components/klodex/catalog-view";
import { useI18n } from "@/lib/i18n";

type ChatGroupKey = "today" | "yesterday" | "week" | "earlier";

/** Bucket sessions into Today / Yesterday / This week / Earlier. */
function useGroupedSessions(sessions: SessionRow[]) {
  return useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86_400_000;
    const startWeek = startToday - 6 * 86_400_000;
    const groups: Record<ChatGroupKey, SessionRow[]> = { today: [], yesterday: [], week: [], earlier: [] };
    for (const s of sessions) {
      const ts = new Date(s.updated_at).getTime();
      if (ts >= startToday) groups.today.push(s);
      else if (ts >= startYesterday) groups.yesterday.push(s);
      else if (ts >= startWeek) groups.week.push(s);
      else groups.earlier.push(s);
    }
    return groups;
  }, [sessions]);
}

export function App() {
  const { lang, t } = useI18n();
  const [catalog, setCatalog] = useState<KlodexProvider[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [selected, setSelected] = useState<{ provider: string; model: string } | null>(null);
  const [mainView, setMainView] = useState<"chat" | "catalog">("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
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
  const groupedSessions = useGroupedSessions(sessions);
  /** Open settings, optionally focusing a specific tab (e.g. "updates" from the toast). */
  const openSettings = (tab: SettingsTab = "general") => {
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
        const isReady = (p?: KlodexProvider) =>
          Boolean(p && (p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local"));

        // 1. If currently selected model is still valid in catalog and ready, keep it
        if (prev) {
          const stillProvider = data.find((p) => p.id === prev.provider);
          const stillModel = Array.isArray(stillProvider?.models)
            ? stillProvider.models.find((m) => m.id === prev.model)
            : undefined;
          if (stillProvider && stillModel && isReady(stillProvider)) return prev;
        }

        // 2. If user saved a model in localStorage, keep it ONLY if provider is ready
        const saved = localStorage.getItem("klodex_model");
        if (saved && saved.includes("/")) {
          const [provId, ...rest] = saved.split("/");
          const modelId = rest.join("/");
          const p = data.find((x) => x.id === provId);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === modelId) : undefined;
          if (p && m && isReady(p)) return { provider: p.id, model: m.id };
        }

        // 3. If user configured defaultProvider/defaultModel in settings, keep it ONLY if provider is ready
        if (backendSettings?.defaultProvider && backendSettings?.defaultModel) {
          const p = data.find((x) => x.id === backendSettings.defaultProvider);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === backendSettings.defaultModel) : undefined;
          if (p && m && isReady(p)) {
            localStorage.setItem("klodex_model", modelKey(p.id, m.id));
            return { provider: p.id, model: m.id };
          }
        }

        // 4. Initial fallback: pick strictly from ready providers
        const pick = data.find(
          (p) => isReady(p) && Array.isArray(p.models) && p.models.length > 0,
        );

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

    const openSettingsEvent = (e?: any) => openSettings(e?.detail?.tab || "general");
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

  const startNewChat = () => {
    setMainView("chat");
    window.dispatchEvent(new Event("klodex:newSession"));
  };

  const openSession = (id: string) => {
    setMainView("chat");
    window.dispatchEvent(new CustomEvent("klodex:openSession", { detail: id }));
  };

  const renameSession = async (s: SessionRow, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === s.title) return;
    await api.updateSession(s.id, { title: trimmed });
    setSessions((prev) => prev.map((item) => (item.id === s.id ? { ...item, title: trimmed } : item)));
    window.dispatchEvent(new CustomEvent("klodex:sessionTitleUpdated", { detail: { id: s.id, title: trimmed } }));
  };

  const deleteSession = async (s: SessionRow) => {
    if (!confirm(t("sidebar.deleteConfirm", { title: s.title ?? s.id.slice(0, 8) }))) return;
    await api.deleteSession(s.id);
    if (activeSessionId === s.id) {
      window.dispatchEvent(new Event("klodex:sessionDeleted"));
    }
    void loadSessions();
  };

  const groupLabels: Record<ChatGroupKey, string> = {
    today: t("sidebar.today"),
    yesterday: t("sidebar.yesterday"),
    week: t("sidebar.week"),
    earlier: t("sidebar.earlier"),
  };

  const renderSessionItem = (s: SessionRow) => (
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
                setEditingSessionId(null);
                await renameSession(s, editSessionTitle);
              } else if (e.key === "Escape") {
                setEditingSessionId(null);
              }
            }}
            onBlur={async () => {
              setEditingSessionId(null);
              await renameSession(s, editSessionTitle);
            }}
            className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ) : (
        <>
          <SidebarMenuButton
            className="justify-start text-xs pr-14"
            isActive={activeSessionId === s.id && mainView === "chat"}
            tooltip={s.title ?? s.id.slice(0, 8)}
            onClick={() => openSession(s.id)}
            onDoubleClick={() => {
              setEditingSessionId(s.id);
              setEditSessionTitle(s.title ?? "");
            }}
          >
            <span className="truncate">{s.title ?? s.id.slice(0, 8)}</span>
            {activeSessionIds.includes(s.id) && (
              <span className="relative flex h-2 w-2 shrink-0 ml-1.5" title={t("sidebar.generating")}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground mr-1 group-data-[collapsible=icon]:hidden">
              {new Date(s.updated_at).toLocaleDateString(lang, { day: "2-digit", month: "2-digit" })}
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
            title={t("sidebar.rename")}
          >
            <Pencil className="size-3 text-muted-foreground hover:text-foreground" />
          </SidebarMenuAction>
          <SidebarMenuAction
            className="right-1"
            showOnHover
            onClick={async (e) => {
              e.stopPropagation();
              await deleteSession(s);
            }}
            title={t("sidebar.deleteChat")}
          >
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </SidebarMenuAction>
        </>
      )}
    </SidebarMenuItem>
  );

  return (
    <SidebarProvider className="h-svh max-h-svh overflow-hidden">
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <SidebarHeader className="p-2.5">
          <div className="flex items-center gap-2.5 px-2 py-1.5 text-base font-bold tracking-tight">
            <KlodexIcon size={22} className="shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">klodex</span>
          </div>
          <button
            onClick={startNewChat}
            className="mx-0.5 mt-1 flex h-8 w-[calc(100%-2px)] items-center gap-2 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:bg-primary/85 cursor-pointer"
            title={t("sidebar.newChat")}
          >
            <Plus className="size-4 shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">{t("sidebar.newChat")}</span>
          </button>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="pb-1">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setMainView(mainView === "catalog" ? "chat" : "catalog")}
                  isActive={mainView === "catalog"}
                  tooltip={t("sidebar.skillsAndPrompts")}
                  className="justify-start gap-2.5 text-xs h-9 cursor-pointer"
                >
                  <Boxes className="size-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">{t("sidebar.skillsAndPrompts")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>
                {t("sidebar.chats")}
                {sessions.length > 0 && (
                  <span className="ml-1 text-muted-foreground font-normal">({sessions.length})</span>
                )}
              </span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {(["today", "yesterday", "week", "earlier"] as ChatGroupKey[]).map((key) =>
                groupedSessions[key].length > 0 ? (
                  <div key={key}>
                    <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                      {groupLabels[key]}
                    </div>
                    <SidebarMenu className="gap-0.5">{groupedSessions[key].map(renderSessionItem)}</SidebarMenu>
                  </div>
                ) : null,
              )}
              {!sessions.length && (
                <div className="px-2 text-muted-foreground text-xs">
                  {t("sidebar.emptyChats")}
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-3 space-y-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => openSettings()}
                className="justify-start"
                tooltip={t("sidebar.settings")}
                title={t("sidebar.settings")}
              >
                <Settings2 className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">{t("sidebar.settings")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] leading-relaxed px-2 group-data-[collapsible=icon]:hidden">
            <KlodexIcon size={12} className="opacity-70 shrink-0" />
            <span>klodex 0.1 · {t("sidebar.providersCount", { count: catalog.length })}</span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex h-svh max-h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
