import { useEffect, useMemo, useState } from "react";
import {
  Bug,
  FolderCode,
  Gauge,
  Layers,
  RotateCcw,
  Sparkles,
  Terminal,
  TestTube2,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface Props {
  providerName?: string;
  modelName?: string;
  projectDir?: string;
  onSelectPrompt: (text: string) => void;
  onOpenSettings?: () => void;
  onPickProjectDir?: () => void;
}

export function ChatEmptyState({
  providerName = "OpenCode",
  modelName = "deepseek-v4.1-flash-free",
  projectDir,
  onSelectPrompt,
  onOpenSettings,
  onPickProjectDir,
}: Props) {
  const { t } = useI18n();
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const greetings = useMemo(
    () => [
      t("empty.greeting1"),
      t("empty.greeting2"),
      t("empty.greeting3"),
      t("empty.greeting4"),
      t("empty.greeting5"),
      t("empty.greeting6"),
      t("empty.greeting7"),
      t("empty.greeting8"),
    ],
    [t]
  );

  const quickActions = useMemo(
    () => [
      {
        icon: Sparkles,
        label: t("empty.auditLabel"),
        prompt: t("empty.auditPrompt"),
      },
      {
        icon: Wand2,
        label: t("empty.moduleLabel"),
        prompt: t("empty.modulePrompt"),
      },
      {
        icon: Bug,
        label: t("empty.bugLabel"),
        prompt: t("empty.bugPrompt"),
      },
      {
        icon: Layers,
        label: t("empty.refactorLabel"),
        prompt: t("empty.refactorPrompt"),
      },
      {
        icon: TestTube2,
        label: t("empty.testsLabel"),
        prompt: t("empty.testsPrompt"),
      },
      {
        icon: Gauge,
        label: t("empty.perfLabel"),
        prompt: t("empty.perfPrompt"),
      },
      {
        icon: Terminal,
        label: t("empty.scriptsLabel"),
        prompt: t("empty.scriptsPrompt"),
      },
    ],
    [t]
  );

  useEffect(() => {
    const r = Math.floor(Math.random() * 8);
    setGreetingIndex(r);
  }, []);

  const handleNextGreeting = () => {
    setGreetingIndex((prev) => (prev + 1) % greetings.length);
    setAnimKey((k) => k + 1);
  };

  const currentGreeting = greetings[greetingIndex] ?? greetings[0];

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto select-none overflow-hidden">
      {/* Subtle clean radial backlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.04),transparent_65%)]" />

      {/* Gemini-grade Headline & Dynamic Text */}
      <div className="flex flex-col items-center text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight font-sans leading-tight">
          <span className="monochrome-gradient-text">{t("empty.hello")}</span>
        </h1>

        <div
          key={`greeting-${animKey}`}
          onClick={handleNextGreeting}
          className="mt-2 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-foreground/80 hover:text-foreground cursor-pointer transition-colors duration-200 animate-in fade-in slide-in-from-bottom-2 duration-300 group flex items-center justify-center gap-2 max-w-xl"
          title={t("empty.shuffleTooltip")}
        >
          <span>{currentGreeting}</span>
          <RotateCcw className="size-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 group-hover:text-muted-foreground transition-opacity shrink-0" />
        </div>

        {/* Minimal Context Pill */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <Badge
            variant="outline"
            onClick={onOpenSettings}
            className="cursor-pointer gap-1.5 px-3 py-1 border-border/80 bg-background/50 hover:bg-accent/60 text-foreground transition-all duration-200 hover:border-primary/40 backdrop-blur-2xs"
            title={t("empty.settingsTooltip")}
          >
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold">{providerName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground truncate max-w-[170px]">
              {modelName}
            </span>
          </Badge>

          <Badge
            variant="outline"
            onClick={onPickProjectDir}
            className={cn(
              "gap-1.5 px-3 py-1 border-border/80 bg-background/40 text-muted-foreground max-w-[260px] backdrop-blur-2xs transition-colors",
              onPickProjectDir && "cursor-pointer hover:bg-accent/60 hover:text-foreground hover:border-primary/40"
            )}
            title={projectDir ? t("empty.projectTooltip", { dir: projectDir }) : t("empty.pickFolder")}
          >
            <FolderCode className="size-3 shrink-0" />
            <span className="truncate font-mono">{projectDir || t("empty.pickFolder")}</span>
          </Badge>
        </div>
      </div>

      {/* Suggestion pills */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-400">
        {quickActions.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(item.prompt)}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/40 hover:bg-card/90 hover:border-foreground/30 px-3.5 py-1.5 text-xs text-foreground/80 hover:text-foreground transition-all duration-200 cursor-pointer shadow-2xs backdrop-blur-xs group"
            >
              <Icon className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Hotkeys helper line */}
      <div className="mt-10 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/60">
        <span>{t("empty.hint")}</span>
      </div>
    </div>
  );
}
