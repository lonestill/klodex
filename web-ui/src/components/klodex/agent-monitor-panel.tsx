import { useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Loader2,
  MessageSquare,
  ShieldAlert,
  StickyNote,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface SubagentTelemetry {
  id: string;
  agent: string;
  model?: string;
  prompt: string;
  status: "pending" | "running" | "done" | "error" | "ratelimit";
  action?: string;
  preview?: string;
  durationMs?: number;
  steps?: number;
}

export interface SwarmTelemetry {
  swarmId: string | null;
  total: number;
  tasks: SubagentTelemetry[];
  notes: Array<{ author: string; key: string; time: string }>;
  messages: Array<{ from: string; to: string; time: string }>;
  ok: number;
  failed: number;
}

export interface MainAgentTelemetry {
  model: string;
  status: "idle" | "running" | "error";
  currentAction?: string;
  preview?: string;
}

interface AgentMonitorPanelProps {
  open: boolean;
  onClose: () => void;
  mainAgent: MainAgentTelemetry;
  swarm: SwarmTelemetry | null;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  coder: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/30" },
  explore: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  tester: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  general: { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
};

export function AgentMonitorPanel({ open, onClose, mainAgent, swarm }: AgentMonitorPanelProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "bus">("agents");

  if (!open) return null;

  const tasks = swarm?.tasks ?? [];
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const rateLimitCount = tasks.filter((t) => t.status === "ratelimit").length;
  const errorCount = tasks.filter((t) => t.status === "error").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <aside className="w-80 md:w-96 border-l bg-card/75 backdrop-blur flex flex-col shrink-0 min-h-0 h-full overflow-hidden transition-all duration-200 z-10">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Cpu className="size-4" />
          </div>
          <div>
            <div className="text-xs font-semibold leading-tight flex items-center gap-1.5">
              Монитор агентов
              {runningCount > 0 && (
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {tasks.length > 0 ? `${tasks.length} в рое • ${runningCount} активно` : "Телеметрия в реальном времени"}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="size-7 text-muted-foreground hover:text-foreground"
          title="Закрыть панель мониторинга"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Main Agent Status Card */}
      <div className="p-3 border-b bg-muted/20 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Bot className="size-3.5 text-primary" />
            <span>Главный агент</span>
          </div>
          <Badge
            variant={mainAgent.status === "running" ? "default" : "secondary"}
            className={cn(
              "text-[9px] px-1.5 py-0 h-4 font-mono font-normal",
              mainAgent.status === "running" && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
            )}
          >
            {mainAgent.status === "running" ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-2.5 animate-spin" /> в работе
              </span>
            ) : (
              "ожидание"
            )}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span className="truncate max-w-[200px]">{mainAgent.model || "текущая модель"}</span>
        </div>

        {mainAgent.currentAction && mainAgent.status === "running" && (
          <div className="rounded border bg-background/60 px-2 py-1 text-[11px] font-mono text-foreground/90 truncate flex items-center gap-1.5">
            <Wrench className="size-3 text-primary shrink-0" />
            <span className="truncate">{mainAgent.currentAction}</span>
          </div>
        )}
      </div>

      {/* Swarm Section */}
      {tasks.length > 0 ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Swarm Metrics Bar */}
          <div className="grid grid-cols-4 gap-1.5 p-2.5 border-b bg-card/50 text-center shrink-0">
            <div className="rounded border bg-background/50 py-1 px-1">
              <span className="block text-[9px] text-muted-foreground uppercase tracking-wider">Всего</span>
              <span className="text-xs font-bold font-mono">{tasks.length}</span>
            </div>
            <div className="rounded border bg-emerald-500/5 border-emerald-500/20 py-1 px-1">
              <span className="block text-[9px] text-emerald-500 font-medium">В работе</span>
              <span className="text-xs font-bold font-mono text-emerald-400">{runningCount}</span>
            </div>
            <div
              className={cn(
                "rounded border py-1 px-1",
                rateLimitCount > 0
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse"
                  : "bg-background/50 border-muted text-muted-foreground",
              )}
            >
              <span className="block text-[9px] font-medium">Лимит 429</span>
              <span className="text-xs font-bold font-mono">{rateLimitCount}</span>
            </div>
            <div
              className={cn(
                "rounded border py-1 px-1",
                errorCount > 0
                  ? "bg-destructive/15 border-destructive/30 text-destructive"
                  : "bg-background/50 border-muted text-muted-foreground",
              )}
            >
              <span className="block text-[9px] font-medium">Сбои</span>
              <span className="text-xs font-bold font-mono">{errorCount}</span>
            </div>
          </div>

          {/* Subagents / Bus Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <div className="px-3 pt-2 shrink-0 border-b">
              <TabsList className="grid grid-cols-2 h-7 p-0.5 bg-muted/50">
                <TabsTrigger value="agents" className="text-[11px] h-6 gap-1">
                  <Users className="size-3" />
                  Субагенты ({tasks.length})
                </TabsTrigger>
                <TabsTrigger value="bus" className="text-[11px] h-6 gap-1">
                  <StickyNote className="size-3" />
                  Доска ({swarm?.notes.length ?? 0})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Subagents List */}
            <TabsContent value="agents" className="flex-1 min-h-0 overflow-y-auto chat-scroll p-2.5 space-y-2 m-0">
              {tasks.map((task) => {
                const colors = ROLE_COLORS[task.agent] || ROLE_COLORS.general;
                const isExpanded = expandedTask === task.id;

                return (
                  <div
                    key={task.id}
                    className={cn(
                      "rounded-lg border bg-card p-2 text-xs transition-all",
                      task.status === "running" && "border-primary/40 shadow-xs",
                      task.status === "ratelimit" && "border-amber-500/50 bg-amber-500/5",
                      task.status === "error" && "border-destructive/40 bg-destructive/5",
                    )}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] px-1 py-0 h-4 font-semibold uppercase", colors.bg, colors.text, colors.border)}
                        >
                          {task.agent}
                        </Badge>
                        <span className="font-mono font-semibold text-xs truncate text-foreground">{task.id}</span>
                      </div>

                      {/* Status Badge */}
                      {task.status === "running" && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1 shrink-0"
                        >
                          <Loader2 className="size-2.5 animate-spin" />
                          работает
                        </Badge>
                      )}
                      {task.status === "ratelimit" && (
                        <Badge
                          variant="destructive"
                          className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/20 text-amber-300 border-amber-500/40 gap-1 shrink-0 animate-pulse"
                        >
                          <AlertTriangle className="size-2.5" />
                          лимит 429
                        </Badge>
                      )}
                      {task.status === "error" && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-1 shrink-0">
                          <AlertCircle className="size-2.5" />
                          сбой
                        </Badge>
                      )}
                      {task.status === "done" && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 gap-1 shrink-0 font-mono"
                        >
                          <CheckCircle2 className="size-2.5" />
                          готово
                        </Badge>
                      )}
                      {task.status === "pending" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground shrink-0">
                          очередь
                        </Badge>
                      )}
                    </div>

                    {/* Task Model & Prompt */}
                    <div
                      className="cursor-pointer group select-none"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                        {isExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
                        <span className="truncate">{task.prompt}</span>
                      </div>
                      {isExpanded && (
                        <div className="mt-1 pl-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {task.prompt}
                          {task.model && (
                            <div className="mt-1 text-[10px] font-mono text-primary/80">модель: {task.model}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Live Action / Status Alert */}
                    {task.status === "ratelimit" && (
                      <div className="mt-2 rounded bg-amber-500/15 border border-amber-500/30 p-1.5 text-[11px] text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                        <span className="leading-tight">
                          Рейтлимит провайдера. Повторные попытки с бэкоффом...
                        </span>
                      </div>
                    )}

                    {task.action && task.status === "running" && (
                      <div className="mt-1.5 rounded border bg-background/80 px-2 py-1 text-[10px] font-mono text-foreground/90 truncate flex items-center gap-1.5">
                        <Wrench className="size-3 text-primary shrink-0" />
                        <span className="truncate">{task.action}</span>
                      </div>
                    )}

                    {task.preview && task.status !== "ratelimit" && (
                      <div className="mt-1 text-[10px] font-mono text-muted-foreground bg-muted/30 rounded px-1.5 py-0.5 truncate">
                        {task.preview}
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            {/* Blackboard & Messaging */}
            <TabsContent value="bus" className="flex-1 min-h-0 overflow-y-auto chat-scroll p-2.5 space-y-2 m-0">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                Заметки на общей доске ({swarm?.notes.length ?? 0}):
              </div>
              {swarm?.notes && swarm.notes.length > 0 ? (
                swarm.notes.map((note, i) => (
                  <div key={i} className="rounded border bg-card p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-semibold text-primary">{note.author}</span>
                      <span>{note.time}</span>
                    </div>
                    <div className="font-mono text-[11px] text-foreground font-medium">{note.key}</div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  Заметок пока нет
                </div>
              )}

              {swarm?.messages && swarm.messages.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                    Сообщения между агентами ({swarm.messages.length}):
                  </div>
                  <div className="space-y-1.5">
                    {swarm.messages.map((msg, i) => (
                      <div key={i} className="rounded border bg-card/60 px-2 py-1.5 text-xs flex items-center justify-between font-mono text-[11px]">
                        <span className="text-purple-400">{msg.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-blue-400">{msg.to}</span>
                        <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        /* Empty Swarm State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground space-y-2">
          <Users className="size-8 opacity-40" />
          <div className="text-xs font-medium text-foreground">Рой агентов не запущен</div>
          <p className="text-[11px] leading-relaxed max-w-[220px]">
            Напиши «запусти рой субагентов», чтобы распределить задачи параллельно между агентами.
          </p>
        </div>
      )}
    </aside>
  );
}
