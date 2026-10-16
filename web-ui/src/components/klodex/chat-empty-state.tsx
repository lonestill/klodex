import { useEffect, useState } from "react";
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

interface Props {
  providerName?: string;
  modelName?: string;
  projectDir?: string;
  onSelectPrompt: (text: string) => void;
  onOpenSettings?: () => void;
  onPickProjectDir?: () => void;
}

const GREETINGS = [
  "Что будем кодить сегодня?",
  "Шелл и файлы наготове. Задавай задачу.",
  "Разберем архитектуру или напишем новый модуль?",
  "Готов к глубокому рефакторингу и поиску багов.",
  "Формулируй задачу любой сложности — код напишем и проверим.",
  "Автономный агент разработки на связи.",
  "Оптимизируем производительность или покроем тестами?",
  "Контекст чист. Готов к работе в директории проекта.",
];

const QUICK_ACTIONS = [
  {
    icon: Sparkles,
    label: "Аудит кодовой базы",
    prompt: "Просканируй структуру проекта, найди узкие места, легаси и потенциальные баги. Предложи конкретные фиксы.",
  },
  {
    icon: Wand2,
    label: "Спроектировать модуль",
    prompt: "Помоги спроектировать и написать новый модуль для этого проекта. Сначала покажи архитектуру и типы, затем рабочий код.",
  },
  {
    icon: Bug,
    label: "Найти и починить баг",
    prompt: "В проекте возникла ошибка при выполнении. Помоги локализовать причину, исследовать файлы и применить фикс.",
  },
  {
    icon: Layers,
    label: "Глубокий рефакторинг",
    prompt: "Проведи рефакторинг текущей кодовой базы: вырежи дублирование, разбей перегруженные файлы и добавь строгие типы.",
  },
  {
    icon: TestTube2,
    label: "Написать юнит-тесты",
    prompt: "Напиши юнит-тесты для основных модулей проекта, уделяя внимание краевым случаям и обработке ошибок.",
  },
  {
    icon: Gauge,
    label: "Оптимизация скорости",
    prompt: "Проанализируй производительность проекта: найди узкие места по времени выполнения и потреблению памяти, предложи оптимизации.",
  },
  {
    icon: Terminal,
    label: "Скрипты автоматизации",
    prompt: "Помоги написать скрипт автоматизации для проекта (билд, миграции или запуск тестов).",
  },
];

export function ChatEmptyState({
  providerName = "OpenCode",
  modelName = "deepseek-v4.1-flash-free",
  projectDir,
  onSelectPrompt,
  onOpenSettings,
  onPickProjectDir,
}: Props) {
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    // Pick random greeting on mount
    const r = Math.floor(Math.random() * GREETINGS.length);
    setGreetingIndex(r);
  }, []);

  const handleNextGreeting = () => {
    setGreetingIndex((prev) => (prev + 1) % GREETINGS.length);
    setAnimKey((k) => k + 1);
  };

  const currentGreeting = GREETINGS[greetingIndex] ?? GREETINGS[0];

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto select-none overflow-hidden">
      {/* Subtle clean radial backlight (no banding blur) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.04),transparent_65%)]" />

      {/* Gemini-grade Headline & Dynamic Text */}
      <div className="flex flex-col items-center text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight font-sans leading-tight">
          <span className="monochrome-gradient-text">Привет.</span>
        </h1>

        <div
          key={`greeting-${animKey}`}
          onClick={handleNextGreeting}
          className="mt-2 text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-foreground/80 hover:text-foreground cursor-pointer transition-colors duration-200 animate-in fade-in slide-in-from-bottom-2 duration-300 group flex items-center justify-center gap-2 max-w-xl"
          title="Нажми, чтобы сменить фразу"
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
            title="Сменить провайдера или модель в настройках"
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
            title={projectDir ? `Папка проекта: ${projectDir} (нажми для смены)` : "Выбрать папку проекта"}
          >
            <FolderCode className="size-3 shrink-0" />
            <span className="truncate font-mono">{projectDir || "Выбрать папку..."}</span>
          </Badge>
        </div>
      </div>

      {/* Clean Gemini-style horizontal suggestion pills (zero vibe-coding slop) */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-400">
        {QUICK_ACTIONS.map((item, idx) => {
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
        <span>Нажми на подсказку или напиши задачу в поле ввода ниже</span>
      </div>
    </div>
  );
}
