import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Loader2,
  StickyNote,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useI18n, localizeStatusMessage, localizeSwarmAction } from "@/lib/i18n";

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
  stage?: string;
  elapsedMs?: number;
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

export function AgentMonitorPanel({ open, onClose, mainAgent, swarm, embedded = false }: AgentMonitorPanelProps & { embedded?: boolean }) {
  const { t, lang } = useI18n();
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"agents" | "bus">("agents");

  if (!open) return null;

  const tasks = swarm?.tasks ?? [];
  const runningCount = tasks.filter((t) => t.status === "running").length;
  const rateLimitCount = tasks.filter((t) => t.status === "ratelimit").length;
  const errorCount = tasks.filter((t) => t.status === "error").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <aside
      className={
        embedded
          ? "flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden"
          : "w-80 md:w-96 border-l bg-card/75 backdrop-blur flex flex-col shrink-0 min-h-0 h-full overflow-hidden transition-all duration-200 z-10"
      }
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Cpu className="size-4" />
          </div>
          <div>
            <div className="text-xs font-semibold leading-tight flex items-center gap-1.5">
              {t("monitor.panelTitle")}
              {runningCount > 0 && (
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {tasks.length > 0
                ? t("monitor.panelSub", { total: tasks.length, running: runningCount })
                : t("monitor.realtime")}
            </div>
          </div>
        </div>
        {!embedded && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="size-7 text-muted-foreground hover:text-foreground"
            title={t("monitor.close")}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Main Agent Status Card */}
      <div className="p-3 border-b bg-muted/20 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Bot className="size-3.5 text-primary" />
            <span>{t("monitor.mainAgent")}</span>
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
                <Loader2 className="size-2.5 animate-spin" /> {t("monitor.inProgress")}
              </span>
            ) : (
              t("monitor.idle")
            )}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span className="truncate max-w-[200px]">{mainAgent.model || t("monitor.currentModel")}</span>
          {mainAgent.status === "running" && typeof mainAgent.elapsedMs === "number" && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-2.5" />
              {Math.floor(mainAgent.elapsedMs / 1000)}s
            </span>
          )}
        </div>

        {mainAgent.currentAction && mainAgent.status === "running" && (
          <div
            className={cn(
              "rounded border px-2 py-1 text-[11px] font-mono truncate flex items-center gap-1.5",
              mainAgent.stage === "retry"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-border bg-background/60 text-foreground/90",
            )}
          >
            {mainAgent.stage === "retry" ? (
              <AlertTriangle className="size-3 text-amber-500 shrink-0" />
            ) : (
              <Wrench className="size-3 text-primary shrink-0" />
            )}
            <span className="truncate">{localizeStatusMessage(mainAgent.currentAction, lang)}</span>
          </div>
        )}

        {mainAgent.status === "running" && (mainAgent.elapsedMs ?? 0) >= 15000 && (
          <div className="text-[10px] text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-1">
            {t("monitor.slowWarning")}
          </div>
        )}
      </div>

      {/* Swarm Section */}
      {tasks.length > 0 ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Swarm Metrics Bar */}
          <div className="grid grid-cols-4 gap-1.5 p-2.5 border-b bg-card/50 text-center shrink-0">
            <div className="rounded border bg-background/50 py-1 px-1">
              <span className="block text-[9px] text-muted-foreground uppercase tracking-wider">{t("monitor.total")}</span>
              <span className="text-xs font-bold font-mono">{tasks.length}</span>
            </div>
            <div className="rounded border bg-emerald-500/5 border-emerald-500/20 py-1 px-1">
              <span className="block text-[9px] text-emerald-500 font-medium">{t("monitor.running")}</span>
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
              <span className="block text-[9px] font-medium">{t("monitor.ratelimit")}</span>
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
              <span className="block text-[9px] font-medium">{t("monitor.errors")}</span>
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
                  {t("monitor.subagents", { count: tasks.length })}
                </TabsTrigger>
                <TabsTrigger value="bus" className="text-[11px] h-6 gap-1">
                  <StickyNote className="size-3" />
                  {t("monitor.board", { count: swarm?.notes.length ?? 0 })}
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
                          {t("monitor.statusRunning")}
                        </Badge>
                      )}
                      {task.status === "ratelimit" && (
                        <Badge
                          variant="destructive"
                          className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/20 text-amber-300 border-amber-500/40 gap-1 shrink-0 animate-pulse"
                        >
                          <AlertTriangle className="size-2.5" />
                          {t("monitor.ratelimit")}
                        </Badge>
                      )}
                      {task.status === "error" && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-1 shrink-0">
                          <AlertCircle className="size-2.5" />
                          {t("monitor.statusError")}
                        </Badge>
                      )}
                      {task.status === "done" && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 gap-1 shrink-0 font-mono"
                        >
                          <CheckCircle2 className="size-2.5" />
                          {t("monitor.statusDone")}
                        </Badge>
                      )}
                      {task.status === "pending" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground shrink-0">
                          {t("monitor.statusPending")}
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
                            <div className="mt-1 text-[10px] font-mono text-primary/80">
                              {t("monitor.modelPrefix", { model: task.model })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Live Action / Status Alert */}
                    {task.status === "ratelimit" && (
                      <div className="mt-2 rounded bg-amber-500/15 border border-amber-500/30 p-1.5 text-[11px] text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                        <span className="leading-tight">
                          {t("monitor.rateLimitAlert")}
                        </span>
                      </div>
                    )}

                    {task.action && task.status === "running" && (
                      <div className="mt-1.5 rounded border bg-background/80 px-2 py-1 text-[10px] font-mono text-foreground/90 truncate flex items-center gap-1.5">
                        <Wrench className="size-3 text-primary shrink-0" />
                        <span className="truncate">{localizeSwarmAction(task.action, lang)}</span>
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
                {t("monitor.notesTitle", { count: swarm?.notes.length ?? 0 })}
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
                  {t("monitor.noNotes")}
                </div>
              )}

              {swarm?.messages && swarm.messages.length > 0 && (
                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                    {t("monitor.messagesTitle", { count: swarm.messages.length })}
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
          <div className="text-xs font-medium text-foreground">{t("monitor.swarmEmpty")}</div>
          <p className="text-[11px] leading-relaxed max-w-[220px]">
            {t("monitor.swarmEmptyDesc")}
          </p>
        </div>
      )}
    </aside>
  );
}
