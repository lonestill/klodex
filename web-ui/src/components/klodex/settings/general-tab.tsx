import { Database, Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { applyTheme } from "./types";

interface GeneralTabProps {
  theme: "dark" | "light" | "system";
  setTheme: (t: "dark" | "light" | "system") => void;
  importOpenCode: boolean;
  setImportOpenCode: (v: boolean) => void;
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (v: boolean) => void;
  showTelemetry: boolean;
  setShowTelemetry: (v: boolean) => void;
}

export function GeneralTab({
  theme,
  setTheme,
  importOpenCode,
  setImportOpenCode,
  autoCheckUpdates,
  setAutoCheckUpdates,
  showTelemetry,
  setShowTelemetry,
}: GeneralTabProps) {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      {/* 1. Interface & Language */}
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Laptop className="size-3.5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {t("settings.interfaceAndEnv")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "ru" ? "Языковые стандарты и визуальная тема оформления" : "Locale standards and visual presentation theme"}
            </p>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-foreground">{t("settings.language")}</div>
            <div className="text-[11px] text-muted-foreground">{t("settings.languageDesc")}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all",
                lang === "en"
                  ? "border-primary/40 bg-primary/15 font-medium text-primary shadow-xs ring-1 ring-primary/20"
                  : "border-border/60 bg-background/50 text-muted-foreground hover:border-border hover:bg-background/80 hover:text-foreground",
              )}
            >
              <span>English</span>
            </button>
            <button
              type="button"
              onClick={() => setLang("ru")}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all",
                lang === "ru"
                  ? "border-primary/40 bg-primary/15 font-medium text-primary shadow-xs ring-1 ring-primary/20"
                  : "border-border/60 bg-background/50 text-muted-foreground hover:border-border hover:bg-background/80 hover:text-foreground",
              )}
            >
              <span>Русский</span>
            </button>
          </div>
        </div>

        {/* Theme Selector */}
        <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-3">
          <div>
            <div className="text-xs font-medium text-foreground">{t("settings.theme")}</div>
            <div className="text-[11px] text-muted-foreground">{t("settings.themeDesc")}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all",
                    isCur
                      ? "border-primary/40 bg-primary/15 font-medium text-primary shadow-xs ring-1 ring-primary/20"
                      : "border-border/60 bg-background/50 text-muted-foreground hover:border-border hover:bg-background/80 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{tTheme.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Telemetry HUD (t/s & context) Toggle */}
        <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-border/40 pt-3 select-none">
          <div>
            <div className="text-xs font-medium text-foreground">
              {lang === "ru" ? "Телеметрия контекста и скорости (t/s)" : "Context & Speed Telemetry (t/s)"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {lang === "ru"
                ? "Отображать живой счетчик скорости генерации (t/s), расход контекста и лимиты"
                : "Display live tokens/sec speed, context window usage, and quota status"}
            </div>
          </div>
          <input
            type="checkbox"
            checked={showTelemetry}
            onChange={(e) => setShowTelemetry(e.target.checked)}
            className="size-4 cursor-pointer rounded border-border accent-primary"
          />
        </label>
      </div>

      {/* 2. System & Integrations */}
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/40 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <div className="flex size-7 items-center justify-center rounded-lg border border-purple-500/25 bg-purple-500/10 text-purple-400">
            <Database className="size-3.5" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
              {t("settings.systemAndIntegrations")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "ru" ? "Синхронизация ключей, локальные конфиги и сервисы" : "Key synchronization, local configurations, and background services"}
            </p>
          </div>
        </div>

        {/* OpenCode Import */}
        <label className="flex cursor-pointer items-center justify-between gap-4 select-none">
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
            className="size-4 cursor-pointer rounded border-border accent-primary"
          />
        </label>

        {/* Auto check updates */}
        <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-border/40 pt-3 select-none">
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
            className="size-4 cursor-pointer rounded border-border accent-primary"
          />
        </label>
      </div>

      <div className="py-2 text-center font-mono text-[11px] text-muted-foreground/80">
        {t("settings.saveShortcut")}
      </div>
    </div>
  );
}
