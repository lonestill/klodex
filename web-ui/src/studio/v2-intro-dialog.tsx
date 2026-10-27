import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Cpu,
  FileCode,
  FolderCode,
  GitBranch,
  Layers,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Sun,
  Terminal,
  Users,
  Wand2,
  X,
  Zap,
  Activity,
  Bot,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "motion/react";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { KlodexProvider } from "@/lib/api";

interface V2IntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangelog?: () => void;
  onOpenSettings?: (tab?: any) => void;
  onOpenPalette?: () => void;
  onNewSessionWithPrompt?: (prompt: string) => void;
  onToggleTheme?: () => void;
  onSelectModel?: (provider: string, model: string) => void;
  catalog?: KlodexProvider[];
  selected?: { provider: string; model: string } | null;
  theme?: "dark" | "light";
}

/* ══════════════════════════════════════════════════
   Dual-Cannon Micro-confetti Canvas
   ══════════════════════════════════════════════════ */

function ConfettiCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const colors = [
      "#ea580c", // terracotta primary
      "#f97316", // bright orange
      "#fbbf24", // amber gold
      "#38bdf8", // electric sky
      "#34d399", // emerald
      "#c084fc", // violet
    ];

    // Dual cannons: left (25%) and right (75%)
    const particles = Array.from({ length: 80 }, (_, i) => {
      const isLeft = i % 2 === 0;
      return {
        x: isLeft ? canvas.width * 0.25 : canvas.width * 0.75,
        y: canvas.height * 0.92,
        vx: (isLeft ? 1 : -1) * (Math.random() * 8 + 3) + (Math.random() - 0.5) * 6,
        vy: -(Math.random() * 14 + 8),
        size: Math.random() * 5.5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 16,
      };
    });

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.38; // gravity
        p.vx *= 0.985;
        p.alpha -= 0.015;
        p.rotation += p.vRot;

        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.75);
          ctx.restore();
        }
      }

      if (alive) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-50 h-full w-full"
    />
  );
}

/* ══════════════════════════════════════════════════
   Self-contained Spotlight Bento Card (Zero Gap Leak)
   ══════════════════════════════════════════════════ */

function BentoCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/75 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card/90 shadow-2xs",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 rounded-2xl transition-opacity duration-250"
        style={{
          opacity: hovered ? 1 : 0,
          background: `radial-gradient(280px circle at ${coords.x}px ${coords.y}px, color-mix(in oklch, var(--primary) 14%, transparent), transparent 75%)`,
        }}
      />
      <div className="relative z-10 flex flex-col flex-1">
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Motion Variants: Diverse per Step
   ══════════════════════════════════════════════════ */

const stepSlideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 36 : -36,
    opacity: 0,
    filter: "blur(4px)",
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: {
      x: { type: "spring" as const, stiffness: 340, damping: 28 },
      opacity: { duration: 0.2 },
      filter: { duration: 0.18 },
      scale: { duration: 0.22 },
    },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -36 : 36,
    opacity: 0,
    filter: "blur(4px)",
    scale: 0.98,
    transition: {
      x: { type: "spring" as const, stiffness: 340, damping: 28 },
      opacity: { duration: 0.16 },
      filter: { duration: 0.16 },
    },
  }),
};

const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 380, damping: 26 },
  },
};

/* ══════════════════════════════════════════════════
   Main Multi-Step Tour Dialog (What's New in v2)
   ══════════════════════════════════════════════════ */

export function V2IntroDialog({
  open,
  onOpenChange,
  onOpenChangelog,
  onOpenSettings,
  onOpenPalette,
  onNewSessionWithPrompt,
  onToggleTheme,
  onSelectModel,
  catalog,
  selected,
  theme = "dark",
}: V2IntroDialogProps) {
  const { t, lang } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [confettiActive, setConfettiActive] = useState(false);

  /* Exactly two curated keyless flagship models as specified by user */
  const demoModels = useMemo(() => {
    return [
      {
        id: "deepseek-v4.1-flash-free",
        prov: "opencode",
        provName: "OpenCode",
        label: "DeepSeek v4.1 Flash",
        tag: "Free Keyless",
        color: "text-emerald-500 border-emerald-500/30",
        desc: lang === "ru"
          ? "256k контекст · Сверхбыстрая генерация кода · Без API-ключа"
          : "256k context · Ultra-fast code generation · Zero keys required",
        speed: "240 t/s",
        speedPct: 94,
      },
      {
        id: "glm-5.3-flash-abliterated",
        prov: "xplabs",
        provName: "XP Labs",
        label: "GLM 5.3 Flash (Abliterated)",
        tag: "Free Uncensored",
        color: "text-purple-400 border-purple-500/30",
        desc: lang === "ru"
          ? "128k контекст · 8x GPU кластер · Без цензуры и ограничений"
          : "128k context · 8x GPU cluster · Uncensored & abliterated",
        speed: "260 t/s",
        speedPct: 98,
      },
    ];
  }, [lang]);

  const [selectedDemoModel, setSelectedDemoModel] = useState<string>(() => {
    return selected?.model || "deepseek-v4.1-flash-free";
  });
  const [modelSwitchNotice, setModelSwitchNotice] = useState<string | null>(null);

  // Step 2: Activity timeline simulator with live progress bar and step timer
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(100);
  const [timelineSteps, setTimelineSteps] = useState([
    { id: 1, text: "Traversed 24 repository files", type: "read", latency: "34ms" },
    { id: 2, text: "Deep Reasoning: modularized settings into 6 sub-tabs", type: "think", latency: "1.12s" },
    { id: 3, text: "Wrote clean patch to App.tsx & studio-chat.tsx", type: "write", latency: "68ms" },
    { id: 4, text: "Verification: bunx tsc -b passed cleanly", type: "check", latency: "420ms" },
  ]);

  const runSimulation = () => {
    setIsSimulating(true);
    setSimulationProgress(15);
    setTimelineSteps([
      { id: 1, text: "Scanning workspace: git status & file tree", type: "read", latency: "18ms" },
    ]);

    setTimeout(() => {
      setSimulationProgress(45);
      setTimelineSteps((prev) => [
        ...prev,
        { id: 2, text: "Deep Reasoning: AST analysis of UI components", type: "think", latency: "0.85s" },
      ]);
    }, 400);

    setTimeout(() => {
      setSimulationProgress(75);
      setTimelineSteps((prev) => [
        ...prev,
        { id: 3, text: "Applied non-breaking patch to ActivityTimeline", type: "write", latency: "42ms" },
      ]);
    }, 850);

    setTimeout(() => {
      setSimulationProgress(100);
      setTimelineSteps((prev) => [
        ...prev,
        { id: 4, text: "Validated build: bunx tsc -b passed with 0 errors", type: "check", latency: "380ms" },
      ]);
      setIsSimulating(false);
    }, 1300);
  };

  // Step 3: Unified dock state & live subagent counter
  const [dockTab, setDockTab] = useState<"diff" | "agents">("diff");
  const [extraAgentAdded, setExtraAgentAdded] = useState(false);

  // Step 4: ⌘K simulated palette toggle
  const [simulatedPaletteOpen, setSimulatedPaletteOpen] = useState(false);

  const totalSteps = 5;
  const stepTitles = [
    t("v2intro.step1Tab"),
    t("v2intro.step2Tab"),
    t("v2intro.step3Tab"),
    t("v2intro.step4Tab"),
    t("v2intro.step5Tab"),
  ];

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem("klodex_v2_intro_seen", "true");
      localStorage.setItem("klodex_v2_intro_seen_v200", "true");
    }
    onOpenChange(false);
  };

  const handleFinish = () => {
    setConfettiActive(true);
    setTimeout(() => {
      handleClose();
    }, 650);
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  };

  const goToStep = (idx: number) => {
    setDirection(idx > currentStep ? 1 : -1);
    setCurrentStep(idx);
  };

  const handleSelectModel = (prov: string, modelId: string, label: string) => {
    setSelectedDemoModel(modelId);
    setModelSwitchNotice(label);
    if (onSelectModel) {
      onSelectModel(prov, modelId);
    }
    setTimeout(() => {
      setModelSwitchNotice(null);
    }, 2400);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl sm:max-w-3xl overflow-hidden rounded-3xl border border-border/80 bg-popover p-0 shadow-2xl"
        style={{
          backgroundImage: `
            radial-gradient(110% 70% at 50% -8%, color-mix(in oklch, var(--primary) 15%, transparent), transparent 72%),
            radial-gradient(90% 45% at 20% -4%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 60%)
          `,
        }}
      >
        <ConfettiCanvas active={confettiActive} />

        {/* Close Button top-right */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4.5 top-4.5 z-30 grid size-8.5 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          aria-label={t("common.close")}
        >
          <X className="size-4.5" />
        </button>

        <div className="relative z-10 flex flex-col p-6 sm:p-8 gap-5 min-h-[590px] justify-between">
          {/* Header Stepper Navigation */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="gap-1.5 rounded-full border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[11px] font-semibold text-primary shadow-xs ring-1 ring-primary/20"
                >
                  <Sparkles className="size-3 text-primary animate-pulse" />
                  <span>{t("v2intro.badge")}</span>
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground/75">
                  Klodex Studio v2 Breakthroughs
                </span>
              </div>

              <span className="font-mono text-xs text-muted-foreground mr-10">
                {t("v2intro.step", { current: currentStep + 1, total: totalSteps })}
              </span>
            </div>

            {/* Stepper Tabs with Sliding Spring Highlight */}
            <div className="flex items-center gap-1.5 border-b border-border/70 pb-2.5">
              {stepTitles.map((label, idx) => {
                const isActive = currentStep === idx;
                const isPassed = currentStep > idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => goToStep(idx)}
                    className={cn(
                      "relative cursor-pointer flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[11px] transition-all",
                      isActive
                        ? "text-primary font-semibold"
                        : isPassed
                          ? "text-foreground/80 hover:bg-accent/40"
                          : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/30",
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTourTab"
                        className="absolute inset-0 rounded-lg bg-primary/15 border border-primary/35 shadow-xs"
                        transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {isPassed ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <span className={cn("size-1.5 rounded-full", isActive ? "bg-primary" : "bg-muted-foreground/40")} />
                      )}
                      <span>{label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Directional Slide & Spring Content */}
          <div className="flex-1 flex flex-col justify-center py-1">
            <AnimatePresence mode="wait" custom={direction}>
              {/* ── STEP 0: FLOATING GLASS RAIL & CANVASES ── */}
              {currentStep === 0 && (
                <motion.div
                  key="step-0"
                  custom={direction}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1.5">
                    <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 font-mono text-[10px]">
                      {lang === "ru" ? "Нововведение #1 · Архитектура интерфейса" : "Feature #1 · Shell Architecture"}
                    </Badge>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                      {lang === "ru" ? "Парящий стеклянный рейл и капсула композера" : "Floating Glass Rail & Capsule Composer"}
                    </h2>
                    <p className="font-display italic text-sm text-muted-foreground leading-relaxed">
                      {lang === "ru"
                        ? "Тяжёлый 300px сайдбар выброшен. Чат занимает 100% полезной площади, навигация живёт в парящем ультра-тонком стекле, а поле ввода стало тактильной капсулой с focus-glow."
                        : "Heavy 300px sidebars are gone. Chat takes 100% screen space, controls float in an airy glass rail, and the composer is now an illuminated tactile capsule."}
                    </p>
                  </div>

                  {/* Interactive Live Mini-Studio Canvas */}
                  <motion.div
                    variants={staggerContainerVariants}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col gap-3"
                  >
                    <motion.div
                      variants={staggerItemVariants}
                      className="relative overflow-hidden rounded-2xl border border-border/80 bg-card/90 p-3.5 shadow-sm"
                    >
                      {/* Ambient corner glow */}
                      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" />

                      <div className="flex items-center gap-3">
                        {/* Miniature Floating Rail Simulation */}
                        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/80 p-1.5 shadow-2xs shrink-0">
                          <div className="size-6 rounded-lg bg-primary/20 border border-primary/40 grid place-items-center text-primary shadow-xs">
                            <Sparkles className="size-3" />
                          </div>
                          <div className="size-6 rounded-lg bg-muted/60 grid place-items-center text-muted-foreground">
                            <FileCode className="size-3" />
                          </div>
                          <div className="size-6 rounded-lg bg-muted/60 grid place-items-center text-muted-foreground">
                            <Command className="size-3" />
                          </div>
                        </div>

                        {/* Miniature Chat Stream & Glowing Capsule Composer */}
                        <div className="flex-1 flex flex-col gap-2.5">
                          {/* Mini message bubble */}
                          <div className="self-end rounded-xl bg-primary/15 border border-primary/30 px-3 py-1.5 text-[11px] font-mono text-primary flex items-center gap-1.5 shadow-2xs">
                            <span>Refactor monolithic UI to Studio v2</span>
                          </div>

                          {/* Mini assistant reply with animated live streaming indicator */}
                          <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/60 p-2 text-[11px] font-mono">
                            <span className="size-2 rounded-full bg-emerald-400 animate-pulse mt-1 shrink-0" />
                            <div className="flex-1 flex flex-col gap-1">
                              <span className="text-foreground/90 font-medium">Architecture optimized: 100% canvas active</span>
                              <div className="flex items-center gap-1 text-[9.5px] text-muted-foreground">
                                <motion.span
                                  animate={{ opacity: [0.4, 1, 0.4] }}
                                  transition={{ repeat: Infinity, duration: 1.5 }}
                                  className="text-primary font-semibold"
                                >
                                  ● Streaming syntax tree
                                </motion.span>
                              </div>
                            </div>
                          </div>

                          {/* Miniature Capsule Composer with Animated Glowing Border */}
                          <motion.div
                            whileHover={{ scale: 1.01 }}
                            className="relative flex items-center justify-between rounded-xl border border-primary/50 bg-background/90 px-3 py-2 shadow-xs"
                          >
                            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                              <span className="text-foreground/80">Ask Klodex anything…</span>
                              <motion.span
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ repeat: Infinity, duration: 0.85 }}
                                className="inline-block w-1.5 h-3.5 bg-primary rounded-xs"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="h-5 px-1.5 text-[9px] font-mono border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                                DeepSeek v4.1 Flash
                              </Badge>
                              <div className="size-5 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-xs">
                                <ArrowRight className="size-2.5" />
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>

                    {/* 2 Feature Pills with Hover Lift */}
                    <div className="grid grid-cols-2 gap-3">
                      <motion.div
                        variants={staggerItemVariants}
                        whileHover={{ y: -2 }}
                        className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/75 p-2.5 shadow-2xs"
                      >
                        <div className="size-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 grid place-items-center shrink-0">
                          <Layers className="size-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {lang === "ru" ? "100% полезной площади" : "Zero Screen Clutter"}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground leading-snug">
                            {lang === "ru" ? "Чат и код на всю ширину экрана" : "Full widescreen canvas"}
                          </div>
                        </div>
                      </motion.div>

                      <motion.div
                        variants={staggerItemVariants}
                        whileHover={{ y: -2 }}
                        className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/75 p-2.5 shadow-2xs"
                      >
                        <div className="size-7 rounded-lg bg-primary/10 border border-primary/30 text-primary grid place-items-center shrink-0">
                          <Sparkles className="size-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {lang === "ru" ? "Newsreader + Geist" : "Editorial Typography"}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground leading-snug">
                            {lang === "ru" ? "Сериф заголовков и швейцарский моно" : "Warm serif display & precision mono"}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* ── STEP 1: IN-PROMPT MODEL SWITCHER ── */}
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  custom={direction}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10 font-mono text-[10px]">
                        {lang === "ru" ? "Нововведение #2 · Скорость работы" : "Feature #2 · Instant In-Prompt Switcher"}
                      </Badge>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {lang === "ru" ? "Кликни для моментального теста:" : "Click to test in real time:"}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <Cpu className="size-6 text-purple-400" />
                      {lang === "ru" ? "Выбор моделей прямо в поле ввода" : "In-Prompt Model & Provider Picker"}
                    </h2>
                    <p className="font-display italic text-sm text-muted-foreground leading-relaxed">
                      {lang === "ru"
                        ? "Никаких переходов в настройки. В v2 статус-пилюля встроена в инпут — переключайся между DeepSeek и GLM в один клик прямо из поля ввода:"
                        : "No more navigating through settings tabs to switch models. In v2, the selector lives directly in the composer footer with 1-click switching between DeepSeek and GLM:"}
                    </p>
                  </div>

                  {/* 2 Flagship Models with Live Token Velocity Gauges */}
                  <motion.div
                    variants={staggerContainerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-1"
                  >
                    {demoModels.map((m) => {
                      const isCur = selectedDemoModel === m.id || (selected?.provider === m.prov && selected?.model === m.id);
                      return (
                        <motion.div
                          key={`${m.prov}/${m.id}`}
                          variants={staggerItemVariants}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => handleSelectModel(m.prov, m.id, m.label)}
                          className={cn(
                            "group cursor-pointer relative flex flex-col gap-2.5 rounded-2xl border p-4 transition-colors duration-200 shadow-xs",
                            isCur
                              ? "border-primary bg-primary/15 shadow-sm ring-1 ring-primary/40"
                              : "border-border/80 bg-card/80 hover:border-primary/70 hover:bg-card/95",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-semibold text-foreground flex items-center gap-2">
                              <span className={cn("size-2 rounded-full", isCur ? "bg-primary animate-pulse" : "bg-muted-foreground/50")} />
                              {m.label}
                            </span>
                            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[9px] border font-semibold", m.color)}>
                              {m.tag}
                            </span>
                          </div>

                          <p className="text-[11px] text-muted-foreground leading-snug pl-4">
                            {m.desc}
                          </p>

                          {/* Live Token Velocity Gauge */}
                          <div className="pl-4 pt-1 flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Zap className="size-2.5 text-amber-400" />
                                <span>Throughput</span>
                              </span>
                              <span className="text-foreground/90 font-semibold">{m.speed}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${m.speedPct}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                                className={cn(
                                  "h-full rounded-full",
                                  isCur ? "bg-primary" : "bg-muted-foreground/40"
                                )}
                              />
                            </div>
                          </div>

                          <div className="mt-auto pt-1 flex items-center justify-between text-[10px] font-mono text-muted-foreground/80 pl-4 border-t border-border/40">
                            <span className="truncate max-w-[170px]" title={m.provName || m.prov}>
                              Provider: {m.provName || m.prov}
                            </span>
                            {isCur ? (
                              <motion.span
                                initial={{ scale: 0.5, rotate: -30 }}
                                animate={{ scale: 1, rotate: 0 }}
                                className="text-primary font-semibold flex items-center gap-1"
                              >
                                <Check className="size-3" /> Active
                              </motion.span>
                            ) : (
                              <span className="text-muted-foreground/60 group-hover:text-primary transition-colors">
                                Select →
                              </span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  {/* Dynamic Model Switch Feedback Banner */}
                  <AnimatePresence>
                    {modelSwitchNotice && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-center font-mono text-xs text-primary shadow-xs flex items-center justify-center gap-2"
                      >
                        <Check className="size-3.5" />
                        <span>
                          {lang === "ru"
                            ? `Модель ${modelSwitchNotice} моментально активирована в сессии!`
                            : `Model ${modelSwitchNotice} activated instantly for session!`}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* ── STEP 2: ACTIVITY TIMELINE & COLLAPSIBLE REASONING ── */}
              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  custom={direction}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono text-[10px]">
                        {lang === "ru" ? "Нововведение #3 · Чистота ленты чата" : "Feature #3 · Clean Chat Stream"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={runSimulation}
                        disabled={isSimulating}
                        className="h-8 gap-1.5 rounded-xl border-border/70 text-xs text-primary hover:bg-primary/10 cursor-pointer shadow-xs"
                      >
                        {isSimulating ? <RefreshCw className="size-3 animate-spin" /> : <Play className="size-3" />}
                        <span>{lang === "ru" ? "Запустить симуляцию" : "Run Live Simulation"}</span>
                      </Button>
                    </div>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <Sparkles className="size-6 text-emerald-400" />
                      {lang === "ru" ? "Activity-таймлайн мыслей и тулов" : "Activity Timeline & Reasoning Dot-Rail"}
                    </h2>
                    <p className="font-display italic text-sm text-muted-foreground leading-relaxed">
                      {lang === "ru"
                        ? "Раньше размышления и логи вызовов тулов засоряли чат бесконечными простынями. В v2 они схлопываются в элегантные плашки с раскрываемым dot-rail деревом:"
                        : "Lengthy thought chains and tool call logs used to clutter the entire chat. In v2, they collapse into compact rows with expandable dot-rail inspection:"}
                    </p>
                  </div>

                  {/* Interactive Live Accordion Simulator with Progress Bar & Laser Rail */}
                  <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm flex flex-col gap-3">
                    {/* Top simulation progress bar */}
                    <div className="flex items-center justify-between text-[10.5px] font-mono text-muted-foreground border-b border-border/50 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-foreground font-semibold">
                          Deep Reasoning Pipeline ({timelineSteps.length} operations)
                        </span>
                      </div>
                      <span className="text-emerald-500 font-semibold">{simulationProgress}% complete</span>
                    </div>

                    <div className="h-1 w-full rounded-full bg-border/40 overflow-hidden -mt-1">
                      <motion.div
                        animate={{ width: `${simulationProgress}%` }}
                        transition={{ duration: 0.35 }}
                        className="h-full bg-emerald-400 rounded-full"
                      />
                    </div>

                    <div className="relative flex flex-col gap-2.5 pt-1">
                      {/* Vertical Glowing Laser Connector Rail */}
                      <div className="absolute left-[7px] top-3 bottom-3 w-[2px] bg-gradient-to-b from-emerald-500 via-primary to-transparent opacity-60" />

                      <AnimatePresence>
                        {timelineSteps.map((s, idx) => (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, x: -12, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.22, delay: idx * 0.04 }}
                            className="relative z-10 flex items-center justify-between gap-3 text-xs font-mono rounded-xl bg-background/60 border border-border/40 p-2.5 hover:border-border transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="size-2.5 rounded-full bg-emerald-400 border-2 border-background shrink-0 shadow-xs" />
                              <span className="truncate text-foreground/90 font-medium">{s.text}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className="font-mono text-[9px] px-1.5 h-4 border-muted-foreground/30 text-muted-foreground">
                                {s.latency}
                              </Badge>
                              <Badge variant="outline" className="font-mono text-[9px] px-1.5 h-4 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                                step {idx + 1}
                              </Badge>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: UNIFIED DOCK SYSTEM ── */}
              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  custom={direction}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1.5">
                    <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10 font-mono text-[10px]">
                      {lang === "ru" ? "Нововведение #4 · Исправление багов вёрстки" : "Feature #4 · Layout Integrity"}
                    </Badge>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <FolderCode className="size-6 text-sky-400" />
                      {lang === "ru" ? "Единый правый док вместо развала экрана" : "Unified Right Dock System"}
                    </h2>
                    <p className="font-display italic text-sm text-muted-foreground leading-relaxed">
                      {lang === "ru"
                        ? "Критический баг старого UI: одновременное открытие Git-диффов и монитора субагентов ломало экран и сжимало чат в ноль. В v2 они делят один правый док с табами:"
                        : "Major bug in legacy UI: opening git diffs and subagents side-by-side crushed the chat window. In v2, both live harmoniously inside a unified right dock with tabs:"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-1.5 rounded-xl bg-background/80 p-1 border border-border/50">
                      <button
                        type="button"
                        onClick={() => setDockTab("diff")}
                        className={cn(
                          "relative flex-1 cursor-pointer rounded-lg py-1.5 text-center font-mono text-xs transition-all",
                          dockTab === "diff"
                            ? "bg-card text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {dockTab === "diff" && (
                          <motion.div
                            layoutId="activeDockTab"
                            className="absolute inset-0 rounded-lg bg-card border border-border/70 shadow-xs"
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                          <GitBranch className="size-3.5 text-emerald-400" />
                          <span>Git Diff (3 files)</span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDockTab("agents")}
                        className={cn(
                          "relative flex-1 cursor-pointer rounded-lg py-1.5 text-center font-mono text-xs transition-all",
                          dockTab === "agents"
                            ? "bg-card text-foreground font-semibold shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {dockTab === "agents" && (
                          <motion.div
                            layoutId="activeDockTab"
                            className="absolute inset-0 rounded-lg bg-card border border-border/70 shadow-xs"
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center justify-center gap-1.5">
                          <Users className="size-3.5 text-sky-400" />
                          <span>Subagent Swarm ({extraAgentAdded ? 3 : 2} active)</span>
                        </span>
                      </button>
                    </div>

                    <div className="min-h-[145px] rounded-xl border border-border/40 bg-background/60 p-3.5 font-mono text-xs flex flex-col justify-center">
                      <AnimatePresence mode="wait">
                        {dockTab === "diff" ? (
                          <motion.div
                            key="tab-diff"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-2"
                          >
                            <motion.div whileHover={{ x: 2 }} className="flex justify-between items-center text-emerald-400 p-1 rounded-md hover:bg-emerald-500/10 transition-colors">
                              <span className="font-semibold">+48 src/studio/v2-intro-dialog.tsx</span>
                              <span className="text-[10px] text-muted-foreground">rich motion suite</span>
                            </motion.div>
                            <motion.div whileHover={{ x: 2 }} className="flex justify-between items-center text-emerald-400 p-1 rounded-md hover:bg-emerald-500/10 transition-colors">
                              <span className="font-semibold">+24 src/studio/studio-app.tsx</span>
                              <span className="text-[10px] text-muted-foreground">clean callbacks</span>
                            </motion.div>
                            <motion.div whileHover={{ x: 2 }} className="flex justify-between items-center text-amber-400 p-1 rounded-md hover:bg-amber-500/10 transition-colors">
                              <span className="font-semibold">~12 src/lib/i18n.tsx</span>
                              <span className="text-[10px] text-muted-foreground">en/ru localization</span>
                            </motion.div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="tab-agents"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-2.5"
                          >
                            <div className="flex flex-col gap-1.5 border-b border-border/40 pb-2">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-foreground font-medium">
                                  <span className="relative flex size-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                                  </span>
                                  Coder Agent #1: Refactoring UI components
                                </span>
                                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px]">
                                  running
                                </Badge>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
                                <motion.div
                                  animate={{ width: ["45%", "85%", "75%"] }}
                                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                  className="h-full rounded-full bg-emerald-400"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-foreground font-medium">
                                <span className="size-2 rounded-full bg-primary" />
                                Explorer Agent #2: Mapping symbols
                              </span>
                              <Badge variant="outline" className="text-primary border-primary/30 text-[10px]">
                                completed
                              </Badge>
                            </div>

                            {extraAgentAdded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="flex items-center justify-between pt-1 border-t border-border/40"
                              >
                                <span className="flex items-center gap-2 text-sky-400 font-medium">
                                  <span className="size-2 rounded-full bg-sky-400 animate-pulse" />
                                  Tester Agent #3: Typechecking workspace
                                </span>
                                <Badge variant="outline" className="text-sky-400 border-sky-500/30 text-[10px]">
                                  active
                                </Badge>
                              </motion.div>
                            )}

                            {!extraAgentAdded && (
                              <button
                                type="button"
                                onClick={() => setExtraAgentAdded(true)}
                                className="w-full text-center py-1 text-[10.5px] text-primary hover:underline cursor-pointer font-mono"
                              >
                                + {lang === "ru" ? "Запустить тестового агента #3 в рой" : "Spawn test agent #3 into swarm"}
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 4: ⌘K PALETTE & MODULAR SETTINGS ── */}
              {currentStep === 4 && (
                <motion.div
                  key="step-4"
                  custom={direction}
                  variants={stepSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="flex flex-col gap-4"
                >
                  <div className="space-y-1.5">
                    <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 font-mono text-[10px]">
                      {lang === "ru" ? "Нововведение #5 · Быстрый контроль и модульность" : "Feature #5 · Modular Power"}
                    </Badge>
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <Command className="size-6 text-primary" />
                      {lang === "ru" ? "Командная палитра ⌘K и модульные настройки" : "⌘K Command Palette & Modular Settings"}
                    </h2>
                    <p className="font-display italic text-sm text-muted-foreground leading-relaxed">
                      {lang === "ru"
                        ? "Монолит на 2060 строк распилен на 6 чистых вкладок с сохранением по Cmd+S. А глобальная палитра ⌘K находит сессии, модели и команды за 1 миллисекунду:"
                        : "2,060 lines of monolithic settings rewritten into 6 decoupled tabs with Cmd+S save. And global ⌘K command palette locates chats and models in 1ms:"}
                    </p>
                  </div>

                  {/* Interactive Simulated ⌘K Search Palette */}
                  <div className="flex flex-col gap-2.5">
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      onClick={() => setSimulatedPaletteOpen(!simulatedPaletteOpen)}
                      className="flex cursor-pointer items-center justify-between rounded-2xl border border-border/80 bg-background/85 px-4 py-3 text-left font-mono text-xs text-muted-foreground hover:border-primary/60 hover:bg-accent/40 transition-all shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <Search className="size-4 text-primary" />
                        <span className="text-foreground/90 font-medium">
                          {lang === "ru" ? "Поиск сессий, моделей и команд…" : "Search sessions, models and actions…"}
                        </span>
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ repeat: Infinity, duration: 0.85 }}
                          className="inline-block w-1 h-3.5 bg-primary rounded-xs"
                        />
                      </div>
                      <kbd className="rounded border border-border/80 bg-card px-2 py-0.5 text-[11px] font-mono text-foreground shadow-2xs">
                        ⌘K
                      </kbd>
                    </motion.div>

                    {/* Expandable Simulated Command List */}
                    <AnimatePresence>
                      {simulatedPaletteOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden rounded-xl border border-border/70 bg-card/90 p-2 font-mono text-xs flex flex-col gap-1 shadow-sm"
                        >
                          <div className="flex items-center justify-between p-2 rounded-lg bg-accent/40 text-foreground">
                            <span className="flex items-center gap-2">
                              <Sparkles className="size-3.5 text-primary" />
                              <span>Create new coding session</span>
                            </span>
                            <kbd className="text-[10px] text-muted-foreground">⌘N</kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/30 text-muted-foreground hover:text-foreground">
                            <span className="flex items-center gap-2">
                              <GitBranch className="size-3.5 text-emerald-400" />
                              <span>Inspect Git diff changes</span>
                            </span>
                            <kbd className="text-[10px]">⌘D</kbd>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/30 text-muted-foreground hover:text-foreground">
                            <span className="flex items-center gap-2">
                              <Sun className="size-3.5 text-amber-400" />
                              <span>Switch color atmosphere</span>
                            </span>
                            <kbd className="text-[10px]">⌘T</kbd>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Atmosphere Switcher with Tactile Cards & Spin Physics */}
                  <div className="grid grid-cols-2 gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (theme !== "dark" && onToggleTheme) onToggleTheme();
                      }}
                      className={cn(
                        "cursor-pointer flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all shadow-2xs",
                        theme === "dark"
                          ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30 font-semibold"
                          : "border-border/70 bg-card/70 hover:border-border",
                      )}
                    >
                      <motion.div
                        animate={{ rotate: theme === "dark" ? 0 : 180 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-card border border-border text-foreground shadow-2xs"
                      >
                        <Moon className="size-4 text-sky-400" />
                      </motion.div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">Warm Charcoal</div>
                        <div className="text-[10px] text-muted-foreground">{lang === "ru" ? "Тёмная тема (по умолчанию)" : "Dark first aesthetic"}</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (theme !== "light" && onToggleTheme) onToggleTheme();
                      }}
                      className={cn(
                        "cursor-pointer flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all shadow-2xs",
                        theme === "light"
                          ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30 font-semibold"
                          : "border-border/70 bg-card/70 hover:border-border",
                      )}
                    >
                      <motion.div
                        animate={{ rotate: theme === "light" ? 0 : -180 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-card border border-border text-foreground shadow-2xs"
                      >
                        <Sun className="size-4 text-amber-400" />
                      </motion.div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">Cream Paper</div>
                        <div className="text-[10px] text-muted-foreground">{lang === "ru" ? "Тёплая светлая тема" : "Crisp light mode"}</div>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stepper Footer Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/70 pt-4">
            {/* Don't show again checkbox */}
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="size-4 cursor-pointer rounded border-border accent-primary"
              />
              <span>{t("v2intro.dontShowAgain")}</span>
            </label>

            {/* Step navigation buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span>{t("v2intro.skip")}</span>
              </Button>

              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBack}
                  className="h-9 gap-1.5 rounded-xl border-border/70 px-3.5 text-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>{t("v2intro.back")}</span>
                </Button>
              )}

              {currentStep < totalSteps - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="h-9 gap-2 rounded-xl bg-primary px-4.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all cursor-pointer"
                >
                  <span>{t("v2intro.next")}</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleFinish}
                  className="h-9 gap-2 rounded-xl bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-primary/25 transition-all cursor-pointer relative overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-1.5">
                    <span>{t("v2intro.finish")}</span>
                    <Rocket className="size-3.5" />
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
