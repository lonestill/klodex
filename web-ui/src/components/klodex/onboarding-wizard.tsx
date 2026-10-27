import { useState } from "react";
import {
  Check,
  ChevronRight,
  FolderOpen,
  Globe,
  Key,
  Laptop,
  Rocket,
  Sparkles,
  Zap,
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
} from "@/lib/api";
import { KlodexIcon } from "@/components/klodex/klodex-icon";
import { useI18n, type Language } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: KlodexProvider[];
  onCatalogRefresh: () => Promise<void>;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  defaultProjectDir?: string;
}

type OnboardingMode = "free" | "local" | "byok";

export function OnboardingWizard({
  open,
  onOpenChange,
  catalog,
  onCatalogRefresh,
  onSelectedChange,
  defaultProjectDir = "",
}: Props) {
  const { lang, setLang, t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [mode, setMode] = useState<OnboardingMode>("free");
  const [projectDir, setProjectDir] = useState(() => defaultProjectDir || (localStorage.getItem("klodex_project") ?? ""));

  // BYOK specific state
  const [byokProviderId, setByokProviderId] = useState("openai");
  const [byokKey, setByokKey] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      let chosenProvider = "opencode";
      let chosenModel = "deepseek-v4.1-flash-free";

      const cat = Array.isArray(catalog) ? catalog : [];
      if (mode === "free") {
        const oc = cat.find((p) => p.id === "opencode");
        chosenProvider = oc ? "opencode" : (cat.find((p) => p.category === "free_keyless")?.id ?? "opencode");
        const m = oc?.models.find((x) => x.id === "deepseek-v4.1-flash-free") ?? oc?.models[0];
        chosenModel = m?.id ?? "deepseek-v4.1-flash-free";
      } else if (mode === "local") {
        const loc = cat.find((p) => p.status === "local") ?? cat.find((p) => p.id === "ollama");
        chosenProvider = loc?.id ?? "ollama";
        chosenModel = loc?.models[0]?.id ?? "llama3.2";
      } else if (mode === "byok") {
        chosenProvider = byokProviderId;
        const p = cat.find((x) => x.id === byokProviderId);
        chosenModel = p?.models[0]?.id ?? "gpt-6-astra";
        if (byokKey.trim()) {
          await api.saveKey(byokProviderId, byokKey.trim());
          await onCatalogRefresh();
        }
      }

      // Save active model selection
      onSelectedChange({ provider: chosenProvider, model: chosenModel });
      localStorage.setItem("klodex_model", modelKey(chosenProvider, chosenModel));

      // Save project path
      if (projectDir.trim()) {
        localStorage.setItem("klodex_project", projectDir.trim());
      }

      // Mark first run as completed on backend and localStorage
      localStorage.setItem("klodex_onboarding_done", "true");
      await api.saveSettings({
        defaultProvider: chosenProvider,
        defaultModel: chosenModel,
        firstRunCompleted: true,
      });

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    localStorage.setItem("klodex_onboarding_done", "true");
    await api.saveSettings({ firstRunCompleted: true }).catch(() => {});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-2xl backdrop-blur-xl" aria-describedby="onboarding-desc">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-card/40">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <KlodexIcon size={20} />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-semibold tracking-tight text-foreground">{t("onboarding.welcome")}</DialogTitle>
              <DialogDescription id="onboarding-desc" className="text-xs text-muted-foreground mt-0.5">
                {t("onboarding.welcomeDesc")}
              </DialogDescription>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 pt-4">
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step >= 1 ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>1</span>
              {t("onboarding.step1")}
            </div>
            <div className="h-px flex-1 bg-border" />
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step >= 2 ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>2</span>
              {t("onboarding.step2")}
            </div>
            <div className="h-px flex-1 bg-border" />
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step >= 3 ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>3</span>
              {t("onboarding.step3")}
            </div>
            <div className="h-px flex-1 bg-border" />
            <div className={cn("flex items-center gap-1.5 text-xs font-medium", step === 4 ? "text-primary" : "text-muted-foreground")}>
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", step === 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>4</span>
              {t("onboarding.step4")}
            </div>
          </div>
        </DialogHeader>

        {/* Step 1: Language Selection */}
        {step === 1 && (
          <div className="p-6 space-y-3">
            <div className="mb-2">
              <h3 className="text-sm font-semibold">{t("onboarding.langTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("onboarding.langDesc")}</p>
            </div>

            <div
              onClick={() => setLang("en")}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all hover:bg-accent/40",
                lang === "en" ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs" : "border-border bg-card",
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xl">
                🇬🇧
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("onboarding.langEn")}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px]">English</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.langEnDesc")}
                </p>
              </div>
              {lang === "en" && <Check className="size-4 text-primary shrink-0 mt-1" />}
            </div>

            <div
              onClick={() => setLang("ru")}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all hover:bg-accent/40",
                lang === "ru" ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs" : "border-border bg-card",
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xl">
                🇷🇺
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("onboarding.langRu")}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px]">Русский</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.langRuDesc")}
                </p>
              </div>
              {lang === "ru" && <Check className="size-4 text-primary shrink-0 mt-1" />}
            </div>
          </div>
        )}

        {/* Step 2: Mode Selection */}
        {step === 2 && (
          <div className="p-6 space-y-3">
            <div
              onClick={() => setMode("free")}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all hover:bg-accent/40",
                mode === "free" ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs" : "border-border bg-card",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Zap className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("onboarding.modeFreeTitle")}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                    {t("onboarding.modeFreeBadge")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.modeFreeDesc")}
                </p>
              </div>
              {mode === "free" && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
            </div>

            <div
              onClick={() => setMode("local")}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all hover:bg-accent/40",
                mode === "local" ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs" : "border-border bg-card",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
                <Laptop className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("onboarding.modeLocalTitle")}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-sky-500 border-sky-500/30 bg-sky-500/10">
                    {t("onboarding.modeLocalBadge")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.modeLocalDesc")}
                </p>
              </div>
              {mode === "local" && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
            </div>

            <div
              onClick={() => setMode("byok")}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all hover:bg-accent/40",
                mode === "byok" ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs" : "border-border bg-card",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Key className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t("onboarding.modeByokTitle")}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] text-amber-500 border-amber-500/30">
                    {t("onboarding.modeByokBadge")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.modeByokDesc")}
                </p>

                {mode === "byok" && (
                  <div className="mt-3 space-y-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <Select value={byokProviderId} onValueChange={setByokProviderId}>
                        <SelectTrigger className="h-8 min-w-[130px] text-xs bg-background">
                          <SelectValue placeholder={t("onboarding.selectProvider")} />
                        </SelectTrigger>
                        <SelectContent className="text-xs">
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                          <SelectItem value="google">Google Gemini</SelectItem>
                          <SelectItem value="deepseek">DeepSeek</SelectItem>
                          <SelectItem value="groq">Groq</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="password"
                        placeholder={t("onboarding.byokKeyPlaceholder")}
                        value={byokKey}
                        onChange={(e) => setByokKey(e.target.value)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                    </div>
                  </div>
                )}
              </div>
              {mode === "byok" && <Check className="size-4 text-primary shrink-0 mt-0.5" />}
            </div>
          </div>
        )}

        {/* Step 3: Project Directory */}
        {step === 3 && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
              <FolderOpen className="size-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                {t("onboarding.projectDesc")}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">{t("onboarding.projectLabel")}</label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("onboarding.projectPlaceholder")}
                  value={projectDir}
                  onChange={(e) => setProjectDir(e.target.value)}
                  className="h-9 font-mono text-xs flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const picked = await api.pickFolder(t("onboarding.projectTitle"));
                      if (picked) setProjectDir(picked);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="h-9 px-3 text-xs gap-1.5 shrink-0"
                >
                  <FolderOpen className="size-3.5" />
                  {t("onboarding.browseFolder")}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("onboarding.folderTip")}
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" />
                {t("onboarding.summaryReady")}
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between border-b pb-1">
                  <span>{t("onboarding.step1")}:</span>
                  <span className="font-medium text-foreground">
                    {lang === "en" ? "🇬🇧 English" : "🇷🇺 Русский"}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>{t("onboarding.summaryMode")}</span>
                  <span className="font-medium text-foreground">
                    {mode === "free" ? "Free Cloud AI" : mode === "local" ? "Local AI" : `BYOK (${byokProviderId})`}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span>{t("onboarding.summaryModel")}</span>
                  <span className="font-mono text-foreground">
                    {mode === "free" ? "deepseek-v4.1-flash-free" : mode === "local" ? "llama3.2" : t("onboarding.summaryDefault")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("onboarding.summaryProject")}</span>
                  <span className="font-mono text-foreground truncate max-w-[280px]">
                    {projectDir || t("onboarding.summaryCurrent")}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground leading-relaxed">
              {t("onboarding.readyDesc")}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t p-4 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs text-muted-foreground">
            {t("common.skip")}
          </Button>

          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => (s - 1) as any)} className="text-xs">
                {t("common.back")}
              </Button>
            )}

            {step < 4 ? (
              <Button size="sm" onClick={() => setStep((s) => (s + 1) as any)} className="text-xs gap-1">
                {t("common.next")} <ChevronRight className="size-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={saving} className="text-xs gap-1.5 bg-primary text-primary-foreground">
                <Rocket className="size-3.5" />
                {saving ? t("onboarding.launching") : t("onboarding.startCoding")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
