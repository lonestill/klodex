import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { api, type AdcodeUsageInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface AdcodeAuthCardProps {
  onSuccess?: () => void;
  className?: string;
  initialMode?: "register" | "login";
}

export function AdcodeAuthCard({
  onSuccess,
  className,
  initialMode = "register",
}: AdcodeAuthCardProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"register" | "login">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto 1-click generator state
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string | null>(null);

  // Accounts pool state
  const [accounts, setAccounts] = useState<Array<{ email: string; createdAt: number; active: boolean }>>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [switchingEmail, setSwitchingEmail] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  // Usage & Quota state
  const [usage, setUsage] = useState<AdcodeUsageInfo | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const loadAccounts = async () => {
    try {
      const res = await api.adcodeGetAccounts();
      setAccounts(res.accounts || []);
      setActiveEmail(res.activeEmail);
    } catch {}
  };

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const res = await api.adcodeUsage();
      if (res.ok) {
        setUsage(res);
      }
    } catch {} finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
    void loadUsage();
  }, []);

  const handleAutoGenerate = async () => {
    setAutoLoading(true);
    setAutoStatus("Поиск домена временной почты…");
    setError(null);
    setSuccess(null);

    try {
      const res = await api.adcodeAutoAccountStream((step) => {
        setAutoStatus(step);
      });
      if (res.ok) {
        setSuccess(t("auth.accountReady", { email: res.email || "" }));
        setAutoStatus(null);
        await Promise.all([loadAccounts(), loadUsage()]);
        setTimeout(() => {
          onSuccess?.();
        }, 1200);
      }
    } catch (err: any) {
      setError(err?.message ?? t("auth.failedGenerate"));
      setAutoStatus(null);
    } finally {
      setAutoLoading(false);
    }
  };

  const handleSwitchAccount = async (targetEmail: string) => {
    setSwitchingEmail(targetEmail);
    setError(null);
    try {
      await api.adcodeSwitchAccount(targetEmail);
      await Promise.all([loadAccounts(), loadUsage()]);
      setSuccess(t("auth.switchedTo", { email: targetEmail }));
      setTimeout(() => {
        onSuccess?.();
      }, 700);
    } catch (err: any) {
      setError(err?.message ?? t("auth.switchError"));
    } finally {
      setSwitchingEmail(null);
    }
  };

  const handleDeleteAccount = async (targetEmail: string) => {
    setDeletingEmail(targetEmail);
    try {
      await api.adcodeDeleteAccount(targetEmail);
      await Promise.all([loadAccounts(), loadUsage()]);
    } catch (err: any) {
      setError(err?.message ?? t("auth.deleteError"));
    } finally {
      setDeletingEmail(null);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth.enterValidEmail"));
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError(t("auth.passwordLength"));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.adcodeAuth({
        action: mode,
        email: email.trim(),
        password: password.trim(),
      });

      if (res.ok) {
        setSuccess(res.message || t("common.success"));
        await Promise.all([loadAccounts(), loadUsage()]);
        if (mode === "login" && res.emailVerified) {
          setTimeout(() => {
            onSuccess?.();
          }, 800);
        } else if (mode === "register") {
          setTimeout(() => {
            onSuccess?.();
          }, 1500);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? t("auth.authError"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError(t("auth.enterEmailFirst"));
      return;
    }
    setResetLoading(true);
    setError(null);
    try {
      const res = await api.adcodeAuth({
        action: "reset_password",
        email: email.trim(),
      });
      if (res.ok) {
        setSuccess(res.message || t("auth.resetSent"));
      }
    } catch (err: any) {
      setError(err?.message ?? t("auth.resetFailed"));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-card/90 p-4 space-y-3.5 shadow-sm backdrop-blur-xs",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0 border border-primary/20">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
              <span>ADCode Included AI</span>
              <Badge
                variant="outline"
                className="h-4 px-1 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono"
              >
                {t("auth.dailyBadge")}
              </Badge>
            </h4>
            <p className="text-[10px] text-muted-foreground truncate">
              {t("auth.dailyDesc")}
            </p>
          </div>
        </div>

        {activeEmail && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] text-emerald-500 border-emerald-500/40 bg-emerald-500/10 gap-1 shrink-0"
            title={t("auth.activeTitle", { email: activeEmail })}
          >
            <UserCheck className="size-3" />
            <span className="max-w-[120px] truncate">{activeEmail}</span>
          </Badge>
        )}
      </div>

      {/* Live Quota & Token Tracking */}
      {usage && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-emerald-400 fill-emerald-400" />
              <span>{t("auth.dailyBalance")}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-emerald-400 font-semibold text-xs">
                {typeof usage.remainingTokens === "number" && typeof usage.dailyLimit === "number"
                  ? `${(usage.remainingTokens / 1_000_000).toFixed(2)}M / ${(usage.dailyLimit / 1_000_000).toFixed(1)}M`
                  : t("common.ready")}
              </span>
              {typeof usage.percentRemaining === "number" && (
                <span className="text-[10px] text-muted-foreground font-mono">({usage.percentRemaining}%)</span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={loadUsage}
                disabled={loadingUsage}
                title={t("auth.refreshBalance")}
              >
                <RefreshCw className={cn("size-3", loadingUsage && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                (usage.percentRemaining ?? 100) > 30
                  ? "bg-emerald-500"
                  : (usage.percentRemaining ?? 100) > 10
                  ? "bg-amber-500"
                  : "bg-destructive",
              )}
              style={{ width: `${Math.min(100, Math.max(0, usage.percentRemaining ?? 100))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <CheckCircle2 className="size-3" />
              <span>{t("auth.autoRotation")}</span>
            </span>
            {usage.sessionRemainingCredits != null && !Number.isNaN(Number(usage.sessionRemainingCredits)) && (
              <span>{t("auth.remaining", { credits: `${Number(usage.sessionRemainingCredits).toFixed(0)}/${usage.sessionLimitCredits}` })}</span>
            )}
          </div>
        </div>
      )}

      {/* Hero 1-Click Generator Button */}
      <div className="rounded-lg border border-primary/30 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500 fill-amber-500" />
              <span>{t("auth.oneClickTitle")}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t("auth.oneClickDesc")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          disabled={autoLoading}
          onClick={handleAutoGenerate}
          className="w-full h-8 text-xs font-semibold gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
        >
          {autoLoading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>{autoStatus || t("auth.generating")}</span>
            </>
          ) : (
            <>
              <Zap className="size-3.5 fill-current" />
              <span>{t("auth.generateBtn")}</span>
            </>
          )}
        </Button>
      </div>

      {/* Account Pool / Switcher (if any accounts exist) */}
      {accounts.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
            <span>{t("auth.poolTitle", { count: accounts.length })}</span>
            <span className="text-[10px]">{t("auth.poolSub")}</span>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5 chat-scroll">
            {accounts.map((acc) => {
              const isActive = acc.active;
              const isSwitching = switchingEmail === acc.email;
              const isDeleting = deletingEmail === acc.email;

              return (
                <div
                  key={acc.email}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors",
                    isActive
                      ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                      : "border-border/60 bg-muted/20 hover:bg-muted/50 text-muted-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => !isActive && handleSwitchAccount(acc.email)}
                    disabled={isActive || isSwitching}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {isActive ? (
                      <Check className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="size-2 rounded-full bg-muted-foreground/40 shrink-0" />
                    )}
                    <span className="truncate font-mono text-[11px]">{acc.email}</span>
                    {isActive && (
                      <span className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wider shrink-0">
                        {t("auth.active")}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSwitching}
                        onClick={() => handleSwitchAccount(acc.email)}
                        className="h-6 px-1.5 text-[10px] text-primary hover:text-primary cursor-pointer"
                      >
                        {isSwitching ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          t("auth.select")
                        )}
                      </Button>
                    )}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDeleteAccount(acc.email)}
                      className="text-muted-foreground/60 hover:text-destructive p-1 rounded transition-colors cursor-pointer"
                      title={t("auth.delete")}
                    >
                      {isDeleting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Auth Toggle */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground py-1 border-t border-border/50 cursor-pointer"
        >
          <span>{t("auth.manualToggle")}</span>
          {showManual ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {showManual && (
          <div className="pt-2 space-y-3">
            {/* Mode Switcher */}
            <div className="flex rounded-lg bg-muted/60 p-0.5 border border-border/50 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setSuccess(null);
                }}
                className={cn(
                  "flex-1 py-1 rounded-md font-medium transition-colors cursor-pointer text-center",
                  mode === "register"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("auth.createAccount")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccess(null);
                }}
                className={cn(
                  "flex-1 py-1 rounded-md font-medium transition-colors cursor-pointer text-center",
                  mode === "login"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("auth.login")}
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <Mail className="size-3 text-muted-foreground" />
                  <span>{t("auth.email")}</span>
                </label>
                <Input
                  type="email"
                  placeholder="your-email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-8 text-xs font-mono"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <Lock className="size-3 text-muted-foreground" />
                    <span>{t("auth.password")}</span>
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetLoading}
                      className="text-[10px] text-primary hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {resetLoading ? t("auth.sending") : t("auth.forgotPassword")}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-8 pr-8 text-xs font-mono"
                    required
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={loading || !email.trim() || !password.trim()}
                className="w-full h-8 text-xs font-medium gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{mode === "register" ? t("auth.creating") : t("auth.signingIn")}</span>
                  </>
                ) : mode === "register" ? (
                  <span>{t("auth.registerBtn")}</span>
                ) : (
                  <>
                    <KeyRound className="size-3.5" />
                    <span>{t("auth.loginBtn")}</span>
                  </>
                )}
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Error Feedback */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* Success Feedback */}
      {success && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-500 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
          <span className="leading-relaxed">{success}</span>
        </div>
      )}
    </div>
  );
}
