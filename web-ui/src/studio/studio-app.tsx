import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Boxes,
  Moon,
  MessageSquare,
  Plus,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { api, modelKey, type KlodexProvider, type KlodexSettings, type ProviderSort, type SessionRow, type UpdateStatus } from "@/lib/api";
import { SettingsDialog, type SettingsTab } from "@/components/klodex/settings-dialog";
import { ChangelogDialog } from "@/components/klodex/changelog-dialog";
import { UpdateToast } from "@/components/klodex/update-toast";
import { OnboardingWizard } from "@/components/klodex/onboarding-wizard";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { CatalogView } from "@/components/klodex/catalog-view";
import { useI18n } from "@/lib/i18n";
import { StudioChat } from "@/studio/studio-chat";
import { CommandPalette } from "@/studio/command-palette";
import { V2IntroDialog } from "@/studio/v2-intro-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ══════════════════════════════════════════════════
   Ambient canvas
   ══════════════════════════════════════════════════ */

function Aurora({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", dim && "opacity-60")}>
      <div className="absolute -top-48 left-1/4 h-[480px] w-[760px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/[0.09]" />
      <div className="absolute right-[-180px] top-1/3 h-[440px] w-[440px] rounded-full bg-amber-500/[0.05] blur-[120px] dark:bg-amber-400/[0.05]" />
      <div className="absolute bottom-[-120px] left-[-80px] h-[360px] w-[480px] rounded-full bg-primary/[0.05] blur-[110px]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Rail button
   ══════════════════════════════════════════════════ */

function RailButton({
  icon: Icon,
  label,
  active,
  primary,
  onClick,
  children,
  layoutId,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  primary?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  layoutId?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={label}
      whileHover={{ scale: 1.08, y: -1 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 450, damping: 25 }}
      className={cn(
        "group/rb relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl transition-colors duration-200 outline-none",
        primary
          ? "bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/45"
          : active
            ? "text-primary font-semibold"
            : "text-muted-foreground/80 hover:text-foreground",
      )}
    >
      {/* Animated active capsule highlight */}
      {active && !primary && layoutId && (
        <motion.div
          layoutId={layoutId}
          className="absolute inset-0 rounded-2xl bg-primary/15 border border-primary/25 shadow-xs"
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      )}
      {/* Subtle hover background when not active */}
      {!active && !primary && (
        <div className="absolute inset-0 rounded-2xl bg-accent/0 group-hover/rb:bg-accent/60 transition-colors duration-150" />
      )}
      <div className="relative z-10 flex items-center justify-center">
        {Icon ? (
          <Icon className={cn("size-[18px] transition-transform duration-300 ease-out", primary && "group-hover/rb:rotate-90 group-hover/rb:scale-110")} />
        ) : (
          children
        )}
      </div>
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════
   Studio Shell
   ══════════════════════════════════════════════════ */

export function StudioApp() {
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
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [v2IntroOpen, setV2IntroOpen] = useState(() => {
    return localStorage.getItem("klodex_v2_intro_seen_v200") !== "true";
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(() =>
    localStorage.getItem("klodex_update_dismissed"),
  );
  const [activeSessionIds, setActiveSessionIds] = useState<string[]>([]);
  const [providerSort] = useState<ProviderSort>(() => {
    const saved = localStorage.getItem("klodex_providerSort") as ProviderSort | null;
    return saved ?? "category";
  });
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem("klodex_theme") as "dark" | "light") || "dark",
  );
  const [paletteOpen, setPaletteOpen] = useState(false);

  const groupedSessions = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86_400_000;
    const startWeek = startToday - 6 * 86_400_000;
    const g: Record<string, SessionRow[]> = { today: [], yesterday: [], week: [], earlier: [] };
    for (const s of sessions) {
      const ts = new Date(s.updated_at).getTime();
      if (ts >= startToday) g.today.push(s);
      else if (ts >= startYesterday) g.yesterday.push(s);
      else if (ts >= startWeek) g.week.push(s);
      else g.earlier.push(s);
    }
    return g;
  }, [sessions]);

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
      const backendSettings = await api.settings().catch(() => null);

      setSelected((prev) => {
        const isReady = (p?: KlodexProvider) =>
          Boolean(p && (p.hasKey || p.status === "ready" || p.status === "keyless" || p.status === "local"));

        if (prev) {
          const stillProvider = data.find((p) => p.id === prev.provider);
          const stillModel = Array.isArray(stillProvider?.models)
            ? stillProvider.models.find((m) => m.id === prev.model)
            : undefined;
          if (stillProvider && stillModel && isReady(stillProvider)) return prev;
        }

        const saved = localStorage.getItem("klodex_model");
        if (saved && saved.includes("/")) {
          const [provId, ...rest] = saved.split("/");
          const modelId = rest.join("/");
          const p = data.find((x) => x.id === provId);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === modelId) : undefined;
          if (p && m && isReady(p)) return { provider: p.id, model: m.id };
        }

        if (backendSettings?.defaultProvider && backendSettings?.defaultModel) {
          const p = data.find((x) => x.id === backendSettings.defaultProvider);
          const m = Array.isArray(p?.models) ? p.models.find((x) => x.id === backendSettings.defaultModel) : undefined;
          if (p && m && isReady(p)) {
            localStorage.setItem("klodex_model", modelKey(p.id, m.id));
            return { provider: p.id, model: m.id };
          }
        }

        const pick = data.find((p) => isReady(p) && Array.isArray(p.models) && p.models.length > 0);
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
      // server offline
    }
  }, []);

  useEffect(() => {
    setProject(localStorage.getItem("klodex_project") ?? "");
    void loadCatalog(false);
    void loadSessions();
    void api.settings().then((s: KlodexSettings) => {
      if (s.firstRunCompleted === false) {
        localStorage.removeItem("klodex_onboarding_done");
        setOnboardingOpen(true);
      }
    }).catch(() => {});

    const openSettingsEvent = (e?: any) => openSettings(e?.detail?.tab || "general");
    const openOnboarding = () => setOnboardingOpen(true);
    const openCatalog = () => setMainView("catalog");
    const openV2Intro = () => setV2IntroOpen(true);
    const openChangelog = () => setChangelogOpen(true);
    const onNewSession = () => setMainView("chat");
    const onTitleUpdated = (e: any) => {
      const { id, title } = e.detail || {};
      if (id && title) setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    };

    window.addEventListener("klodex:openSettings", openSettingsEvent);
    window.addEventListener("klodex:openOnboarding", openOnboarding);
    window.addEventListener("klodex:openCatalog", openCatalog);
    window.addEventListener("klodex:openV2Intro", openV2Intro);
    window.addEventListener("klodex:openChangelog", openChangelog);
    window.addEventListener("klodex:newSession", onNewSession);
    window.addEventListener("klodex:sessionTitleUpdated", onTitleUpdated);

    return () => {
      window.removeEventListener("klodex:openSettings", openSettingsEvent);
      window.removeEventListener("klodex:openOnboarding", openOnboarding);
      window.removeEventListener("klodex:openCatalog", openCatalog);
      window.removeEventListener("klodex:openV2Intro", openV2Intro);
      window.removeEventListener("klodex:openChangelog", openChangelog);
      window.removeEventListener("klodex:newSession", onNewSession);
      window.removeEventListener("klodex:sessionTitleUpdated", onTitleUpdated);
    };
  }, [loadCatalog, loadSessions]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.updateStatus();
        if (alive) setUpdateStatus(s);
      } catch {}
    };
    void poll();
    const id = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

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

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("klodex_theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
  };

  const sessionMenuItem = (s: SessionRow) => (
    <DropdownMenuItem
      key={s.id}
      onClick={() => {
        setMainView("chat");
        window.dispatchEvent(new CustomEvent("klodex:openSession", { detail: s.id }));
      }}
      className="cursor-pointer gap-2 text-xs"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", activeSessionIds.includes(s.id) ? "bg-primary" : activeSessionId === s.id ? "bg-foreground/60" : "bg-border")} />
      <span className="min-w-0 flex-1 truncate">{s.title ?? s.id.slice(0, 8)}</span>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover/menu-item:opacity-100"
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm(t("sidebar.deleteConfirm", { title: s.title ?? s.id.slice(0, 8) }))) return;
          await api.deleteSession(s.id);
          if (activeSessionId === s.id) window.dispatchEvent(new Event("klodex:sessionDeleted"));
          void loadSessions();
        }}
      >
        <Trash2 className="size-3" />
      </button>
    </DropdownMenuItem>
  );

  const chatsMenu = (
    <DropdownMenuContent side="right" align="center" className="w-64 max-h-[70vh] overflow-y-auto chat-scroll">
      {sessions.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          {t("sidebar.emptyChats")}
        </div>
      )}
      {(["today", "yesterday", "week", "earlier"] as const).map((k) =>
        groupedSessions[k].length > 0 ? (
          <div key={k}>
            <div className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {t(`sidebar.${k}`)}
            </div>
            {groupedSessions[k].map(sessionMenuItem)}
          </div>
        ) : null,
      )}
    </DropdownMenuContent>
  );

  const isCatalog = mainView === "catalog";

  return (
    <div className="relative flex h-svh max-h-svh overflow-hidden bg-background text-foreground">
      <Aurora dim={isCatalog} />

      {/* ── floating glass rail (centered on viewport, non-blocking for canvas) ── */}
      <div className="pointer-events-none fixed left-3 top-1/2 -translate-y-1/2 z-40 flex items-center">
        <motion.nav
          initial={{ x: -28, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 26 }}
          className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-3xl border border-white/10 dark:border-white/[0.08] bg-card/75 dark:bg-card/55 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.35),0_0_24px_rgba(var(--primary-rgb),0.06)] backdrop-blur-2xl ring-1 ring-white/10 dark:ring-white/[0.05]"
        >
          <motion.button
            type="button"
            title="klodex"
            onClick={() => setMainView("chat")}
            whileHover={{ scale: 1.12, rotate: 6 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="mb-1 flex size-10 cursor-pointer items-center justify-center rounded-2xl hover:bg-accent/60 transition-colors"
          >
            <KlodexIcon size={20} />
          </motion.button>

          <RailButton
            icon={Plus}
            primary
            label={t("sidebar.newChat")}
            onClick={() => {
              setMainView("chat");
              window.dispatchEvent(new Event("klodex:newSession"));
            }}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="relative">
                <RailButton
                  icon={MessageSquare}
                  label={t("sidebar.chats")}
                  active={activeSessionId !== null && !isCatalog}
                  layoutId="studioRailActive"
                />
                {activeSessionIds.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary pointer-events-none">
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
                  </span>
                )}
              </div>
            </DropdownMenuTrigger>
            {chatsMenu}
          </DropdownMenu>

          <RailButton
            icon={Boxes}
            label={t("sidebar.skillsAndPrompts")}
            active={isCatalog}
            layoutId="studioRailActive"
            onClick={() => setMainView(isCatalog ? "chat" : "catalog")}
          />

          <div className="my-1 h-px w-6 bg-border/70" />

          <RailButton
            icon={theme === "dark" ? Sun : Moon}
            label={theme === "dark" ? (lang === "ru" ? "Светлая тема" : "Light theme") : (lang === "ru" ? "Тёмная тема" : "Dark theme")}
            onClick={toggleTheme}
          />
          <RailButton icon={Settings2} label={t("sidebar.settings")} onClick={() => openSettings()} />

          <motion.button
            type="button"
            onClick={() => setV2IntroOpen(true)}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.92 }}
            className="mt-1 cursor-pointer px-1 py-0.5 text-center font-mono text-[9px] font-semibold text-primary/75 hover:text-primary transition-colors leading-none"
            title="What's new in Studio v2"
          >
            v2.0
          </motion.button>
        </motion.nav>
      </div>

      {/* ── ⌘K command palette ── */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        sessions={sessions}
        catalog={catalog}
        selected={selected}
        activeSessionIds={activeSessionIds}
        theme={theme}
        onOpenSession={(id) => {
          setMainView("chat");
          window.dispatchEvent(new CustomEvent("klodex:openSession", { detail: id }));
        }}
        onNewChat={() => {
          setMainView("chat");
          window.dispatchEvent(new Event("klodex:newSession"));
        }}
        onOpenCatalog={() => setMainView("catalog")}
        onOpenSettings={() => openSettings()}
        onToggleTheme={toggleTheme}
        onSwitchModel={(provider, model) => {
          setSelected({ provider, model });
          localStorage.setItem("klodex_model", modelKey(provider, model));
        }}
      />

      {/* ── canvas ── */}
      <main className="relative z-10 flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        {isCatalog ? (
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
          <StudioChat
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
            onOpenCatalog={() => setMainView("catalog")}
            onOpenSettings={(tab) => openSettings(tab)}
          />
        )}
      </main>

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
      <V2IntroDialog
        open={v2IntroOpen}
        onOpenChange={setV2IntroOpen}
        catalog={catalog}
        selected={selected}
        onOpenChangelog={() => setChangelogOpen(true)}
        onOpenSettings={(tab) => openSettings(tab)}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
        onSelectModel={(provider, model) => {
          setSelected({ provider, model });
          localStorage.setItem("klodex_model", modelKey(provider, model));
        }}
        onNewSessionWithPrompt={(prompt) => {
          setMainView("chat");
          setV2IntroOpen(false);
          window.dispatchEvent(new Event("klodex:newSession"));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("klodex:setInputText", { detail: prompt }));
          }, 120);
        }}
      />
      <ChangelogDialog
        open={changelogOpen}
        onOpenChange={setChangelogOpen}
        status={updateStatus}
      />
    </div>
  );
}

export default StudioApp;
