import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const [mode, setMode] = useState<"register" | "login">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Введи корректный email");
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
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
        setSuccess(res.message || "Успешно!");
        if (mode === "login" && res.emailVerified) {
          setTimeout(() => {
            onSuccess?.();
          }, 800);
        } else if (mode === "register") {
          // Notify parent of success
          setTimeout(() => {
            onSuccess?.();
          }, 1500);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Сначала введи свой email в поле выше");
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
        setSuccess(res.message || "Ссылка на сброс пароля отправлена на почту.");
      }
    } catch (err: any) {
      setError(err?.message ?? "Не удалось отправить письмо со сбросом пароля");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-card/80 p-4 space-y-4 shadow-sm backdrop-blur-xs",
        className,
      )}
    >
      {/* Header with Mode Switcher */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0 border border-primary/20">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate">
              ADCode Included AI
            </h4>
            <p className="text-[10px] text-muted-foreground truncate">
              Без API-ключей · Free 1,000,000 токенов/день
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-muted/60 p-0.5 border border-border/50 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
              setSuccess(null);
            }}
            className={cn(
              "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer",
              mode === "register"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Создать
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
              setSuccess(null);
            }}
            className={cn(
              "px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer",
              mode === "login"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Войти
          </button>
        </div>
      </div>

      {/* Info Notice */}
      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2.5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 shrink-0 mt-0.5 font-mono"
        >
          Free 1M/day
        </Badge>
        <span>
          {mode === "register"
            ? "Регистрация создаёт бесплатный аккаунт в ADCode и высылает подтверждение на почту. После перехода по ссылке станут доступны GLM 5.3 Flash Uncensored и Tagflow 27B."
            : "Введи данные аккаунта ADCode. Klodex автоматически получит токен и подключит бесплатные модели."}
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Email */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
            <Mail className="size-3 text-muted-foreground" />
            <span>Email</span>
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

        {/* Password */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <Lock className="size-3 text-muted-foreground" />
              <span>Пароль</span>
            </label>
            {mode === "login" && (
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="text-[10px] text-primary hover:underline cursor-pointer disabled:opacity-50"
              >
                {resetLoading ? "Отправка…" : "Забыли пароль?"}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Минимум 6 символов"
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

        {/* Actions */}
        <div className="pt-1 flex items-center justify-between gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full h-8 text-xs font-medium gap-1.5 cursor-pointer shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{mode === "register" ? "Создание аккаунта…" : "Вход…"}</span>
              </>
            ) : mode === "register" ? (
              <>
                <Sparkles className="size-3.5" />
                <span>Создать аккаунт в 1 клик</span>
              </>
            ) : (
              <>
                <KeyRound className="size-3.5" />
                <span>Войти в ADCode</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
