"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Terminal,
  FileText,
  FilePlus,
  FilePenLine,
  FolderSearch,
  Search,
  Bot,
  Wrench,
  Check,
  AlertCircle,
  ChevronDown,
  Copy,
  Loader2,
  Minus,
  Plus,
  Users,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { useI18n } from "@/lib/i18n";

export interface ToolPart {
  type: string;
  toolCallId: string;
  state: "input-available" | "input-streaming" | "output-available" | "output-error" | string;
  input: unknown;
  output?: unknown;
  errorText?: string;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, []);
  return { copied, copy };
}

interface ToolMeta {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  summary: string;
}

function getToolMeta(toolName: string, input: unknown): ToolMeta {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  switch (toolName) {
    case "bash":
      return {
        name: "bash",
        icon: Terminal,
        color: "text-sky-400",
        summary: i.command ? `$ ${String(i.command)}` : "shell command",
      };
    case "read":
      return {
        name: "read",
        icon: FileText,
        color: "text-amber-400",
        summary: i.path ? String(i.path) : "read file",
      };
    case "write":
      return {
        name: "write",
        icon: FilePlus,
        color: "text-emerald-400",
        summary: i.path ? String(i.path) : "write file",
      };
    case "edit":
      return {
        name: "edit",
        icon: FilePenLine,
        color: "text-violet-400",
        summary: i.path ? String(i.path) : "edit file",
      };
    case "glob":
      return {
        name: "glob",
        icon: FolderSearch,
        color: "text-yellow-400",
        summary: i.pattern ? `find: ${String(i.pattern)}` : "find files",
      };
    case "grep":
      return {
        name: "grep",
        icon: Search,
        color: "text-cyan-400",
        summary: i.pattern ? `grep: "${String(i.pattern)}"` : "search code",
      };
    case "subagent": {
      const agentRole = String(i.agent || "subagent");
      const roleColor =
        agentRole === "coder" ? "text-violet-400"
        : agentRole === "explore" ? "text-amber-400"
        : agentRole === "tester" ? "text-emerald-400"
        : "text-fuchsia-400";
      const taskText = String(i.prompt || i.task || "subagent task");
      return {
        name: "subagent",
        icon: Bot,
        color: roleColor,
        summary: `[${agentRole}] ${taskText}`,
      };
    }
    case "swarm": {
      const tasks = Array.isArray(i.tasks) ? i.tasks : [];
      const title = i.title ? `"${String(i.title)}"` : `Swarm (${tasks.length})`;
      const roster = tasks.map((t: any) => t.id || t.agent).filter(Boolean).join(", ");
      return {
        name: "swarm",
        icon: Users,
        color: "text-purple-400",
        summary: `${title}${roster ? ` · ${roster}` : ""}`,
      };
    }
    default:
      return {
        name: toolName,
        icon: Wrench,
        color: "text-muted-foreground",
        summary: typeof input === "string" ? input : JSON.stringify(input || {}),
      };
  }
}

function parseOutputString(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/* ----------------- Tool Payload Views ----------------- */

function BashPayload({ command, output, errorText }: { command: string; output: string; errorText?: string }) {
  const { t } = useI18n();
  const { copied: copiedCmd, copy: copyCmd } = useCopy();
  const { copied: copiedOut, copy: copyOut } = useCopy();

  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between rounded bg-zinc-900/90 px-2.5 py-1.5 text-zinc-300 border border-zinc-800">
        <span className="truncate text-zinc-400">
          $<span className="text-zinc-100 ml-1.5 select-all">{command}</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          onClick={() => copyCmd(command)}
          title={t("tools.copyCommand")}
        >
          {copiedCmd ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </Button>
      </div>

      {(output || errorText) && (
        <div className="relative group/term rounded-md bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-200 border border-zinc-900 max-h-96 overflow-auto">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-5 bg-zinc-900/90 text-zinc-400 hover:text-zinc-100 opacity-0 group-hover/term:opacity-100 transition-opacity"
            onClick={() => copyOut(errorText || output)}
            title={t("tools.copyOutput")}
          >
            {copiedOut ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </Button>
          <pre className={cn("whitespace-pre overflow-x-auto", errorText && "text-rose-400")}>
            {errorText || output}
          </pre>
        </div>
      )}
    </div>
  );
}

function EditPayload({
  path,
  oldString,
  newString,
  output,
  errorText,
}: {
  path: string;
  oldString: string;
  newString: string;
  output: string;
  errorText?: string;
}) {
  const { t } = useI18n();
  const { copied, copy } = useCopy();

  const diffLines = useMemo(() => {
    const oldLines = oldString ? oldString.split("\n") : [];
    const newLines = newString ? newString.split("\n") : [];
    const result: Array<{ type: "del" | "add"; text: string }> = [];
    oldLines.forEach((l) => result.push({ type: "del", text: l }));
    newLines.forEach((l) => result.push({ type: "add", text: l }));
    return result;
  }, [oldString, newString]);

  const rawDiff = useMemo(() => {
    const o = oldString ? oldString.split("\n").map((l) => `-${l}`).join("\n") : "";
    const n = newString ? newString.split("\n").map((l) => `+${l}`).join("\n") : "";
    return `--- ${path}\n+++ ${path}\n${o}\n${n}`;
  }, [path, oldString, newString]);

  return (
    <div className="space-y-1.5 font-mono text-xs">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1 border-b border-border/40">
        <span className="font-semibold text-foreground/90 truncate">{path}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-muted-foreground hover:text-foreground"
          onClick={() => copy(rawDiff)}
          title={t("tools.copyDiff")}
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </Button>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/20 overflow-hidden text-[11px] max-h-72 overflow-y-auto">
        <div className="divide-y divide-border/20 font-mono">
          {diffLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                "px-2.5 py-0.5 whitespace-pre overflow-x-auto flex items-start gap-2",
                line.type === "del"
                  ? "bg-rose-500/10 text-rose-300 border-l-2 border-rose-500/80"
                  : "bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-500/80",
              )}
            >
              <span className="select-none opacity-60 shrink-0 w-3 font-bold">
                {line.type === "del" ? "-" : "+"}
              </span>
              <span className="flex-1">{line.text || " "}</span>
            </div>
          ))}
        </div>
      </div>

      {(output || errorText) && (
        <div className={cn("text-[11px] pt-1", errorText ? "text-destructive" : "text-muted-foreground/80")}>
          {errorText || output}
        </div>
      )}
    </div>
  );
}

function CodePayload({
  path,
  content,
  errorText,
}: {
  path?: string;
  content: string;
  errorText?: string;
}) {
  const { t } = useI18n();
  const { copied, copy } = useCopy();
  const text = errorText || content;

  return (
    <div className="space-y-1.5 font-mono text-xs">
      {path && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1 border-b border-border/40">
          <span className="font-semibold text-foreground/90 truncate">{path}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 text-muted-foreground hover:text-foreground"
            onClick={() => copy(text)}
            title={t("tools.copyContent")}
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </Button>
        </div>
      )}
      <div className="relative group/code rounded bg-muted/40 p-2 text-[11px] border border-border/40 max-h-60 overflow-auto">
        {!path && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-5 bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover/code:opacity-100 transition-opacity"
            onClick={() => copy(text)}
            title={t("common.copy")}
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </Button>
        )}
        <pre className={cn("whitespace-pre-wrap break-all leading-relaxed", errorText && "text-destructive")}>
          {text}
        </pre>
      </div>
    </div>
  );
}

function SubagentPayload({
  agent,
  task,
  output,
  errorText,
}: {
  agent: string;
  task: string;
  output: string;
  errorText?: string;
}) {
  const { t } = useI18n();
  const roleColors: Record<string, string> = {
    explore: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    coder: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    tester: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    general: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded bg-muted/30 p-2.5 border border-border/40 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px] font-mono uppercase px-1.5 py-0", roleColors[agent] ?? "bg-muted text-foreground")}>
            {agent}
          </Badge>
          <span className="text-[11px] font-medium text-muted-foreground">{t("tools.assignedTask")}</span>
        </div>
        <div className="text-xs text-foreground/90 whitespace-pre-wrap">{task}</div>
      </div>
      {(output || errorText) && (
        <div className={cn("p-2.5 rounded bg-background/60 border border-border/40 text-xs", errorText && "text-destructive")}>
          {errorText ? (
            <pre className="whitespace-pre-wrap text-destructive">{errorText}</pre>
          ) : (
            <Streamdown>{output}</Streamdown>
          )}
        </div>
      )}
    </div>
  );
}

function SwarmPayload({
  input,
  output,
  errorText,
}: {
  input: unknown;
  output: unknown;
  errorText?: string;
}) {
  const { t } = useI18n();
  const { copied, copy } = useCopy();
  const [tab, setTab] = useState<"agents" | "board" | "messages">("agents");

  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = typeof i.title === "string" ? i.title : undefined;
  const sharedContext = typeof i.sharedContext === "string" ? i.sharedContext : undefined;
  const scheduledTasks = (Array.isArray(i.tasks) ? i.tasks : []) as Array<{
    id: string;
    agent: string;
    prompt: string;
    model?: string;
  }>;

  let data: any = null;
  if (output && typeof output === "object") {
    data = output;
  } else if (typeof output === "string") {
    try {
      data = JSON.parse(output);
    } catch {}
  }

  const tasksList: Array<{
    id: string;
    agent: string;
    model?: string;
    ok?: boolean;
    report?: string;
    steps?: number;
    durationMs?: number;
    notesPosted?: number;
    messagesSent?: number;
    prompt?: string;
  }> = data?.tasks ?? scheduledTasks.map((t) => ({
    id: t.id,
    agent: t.agent,
    prompt: t.prompt,
    model: t.model,
    ok: true,
    report: "",
    durationMs: 0,
    steps: 0,
  }));

  const blackboard = (data?.blackboard ?? {}) as Record<
    string,
    { author: string; key: string; content: string; timestamp: number }
  >;
  const boardEntries = Object.entries(blackboard);
  const messages = (data?.messages ?? []) as Array<{
    from: string;
    to: string;
    message: string;
    timestamp: number;
  }>;

  const isCompleted = Boolean(data && data.total !== undefined);
  const totalCount = data?.total ?? scheduledTasks.length;
  const completedCount = data?.completed ?? 0;
  const failedCount = data?.failed ?? 0;
  const durationSec = data?.durationMs ? (data.durationMs / 1000).toFixed(1) : undefined;

  const rawReportText =
    data?.markdownReport ||
    (typeof output === "string" ? output : JSON.stringify(output ?? {}, null, 2));

  const roleColors: Record<string, string> = {
    explore: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    coder: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    tester: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    general: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Users className="size-3.5 text-purple-400" />
            <span>{title || t("tools.swarmTitle")}</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">
            {t("tools.agentsCount", { count: totalCount })}
          </Badge>
          {isCompleted && (
            <>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                {t("tools.completedCount", { count: completedCount })}
              </Badge>
              {failedCount > 0 && (
                <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30">
                  {t("tools.failedCount", { count: failedCount })}
                </Badge>
              )}
              {durationSec && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {durationSec}s
                </span>
              )}
            </>
          )}
          {!isCompleted && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-primary">
              <Loader2 className="size-2.5 animate-spin" /> {t("tools.swarmRunning")}
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => copy(rawReportText)}
          title={t("tools.copyReport")}
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span>{t("common.copy")}</span>
        </Button>
      </div>

      {sharedContext && (
        <div className="text-[11px] p-2 rounded bg-muted/20 border border-border/30 text-muted-foreground">
          <span className="font-semibold text-foreground/80">{t("tools.swarmContext")}</span> {sharedContext}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 pb-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("agents")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
            tab === "agents" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Bot className="size-3" />
          <span>{t("tools.agents", { count: tasksList.length })}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("board")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
            tab === "board" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <StickyNote className="size-3" />
          <span>{t("tools.blackboard", { count: boardEntries.length })}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("messages")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer",
            tab === "messages" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="size-3" />
          <span>{t("tools.teamChat", { count: messages.length })}</span>
        </button>
      </div>

      {/* Tab: Agents */}
      {tab === "agents" && (
        <div className="space-y-2">
          {tasksList.map((task, idx) => {
            const role = task.agent || "general";
            const originalPrompt = task.prompt || scheduledTasks.find((s) => s.id === task.id)?.prompt || "";
            return (
              <div key={task.id || idx} className="rounded-lg border border-border/50 bg-card/60 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-semibold text-foreground text-xs">
                      [{task.id}]
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] font-mono uppercase px-1.5 py-0", roleColors[role] ?? "bg-muted text-foreground")}>
                      {role}
                    </Badge>
                    {task.model && (
                      <span className="text-[10px] font-mono text-muted-foreground/70 truncate max-w-36">
                        {task.model}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px]">
                    {isCompleted ? (
                      task.ok !== false ? (
                        <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-medium">
                          <Check className="size-3" />
                          {task.durationMs ? `${(task.durationMs / 1000).toFixed(1)}s` : t("tools.done")}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-destructive text-[10px] font-medium">
                          <AlertCircle className="size-3" /> {t("tools.error")}
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1 text-primary text-[10px]">
                        <Loader2 className="size-2.5 animate-spin" /> {t("tools.running")}
                      </div>
                    )}
                  </div>
                </div>

                {originalPrompt && (
                  <div className="text-[11px] text-muted-foreground/90 bg-muted/20 p-2 rounded border border-border/30">
                    <span className="font-semibold text-foreground/80">{t("tools.taskLabel")}</span> {originalPrompt}
                  </div>
                )}

                {task.report && (
                  <div className="p-2.5 rounded bg-background/80 border border-border/40 text-xs text-foreground/90 leading-relaxed overflow-x-auto">
                    <Streamdown>{task.report}</Streamdown>
                  </div>
                )}

                {(Boolean(task.notesPosted) || Boolean(task.messagesSent)) && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
                    {task.notesPosted ? <span>{t("tools.notesCount", { count: task.notesPosted })}</span> : null}
                    {task.messagesSent ? <span>{t("tools.messagesCount", { count: task.messagesSent })}</span> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Blackboard */}
      {tab === "board" && (
        <div className="space-y-2">
          {boardEntries.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-xs italic bg-muted/10 rounded-md">
              {t("tools.noNotes")}
            </div>
          ) : (
            boardEntries.map(([key, n]) => (
              <div key={key} className="rounded-md border border-border/50 bg-card/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <StickyNote className="size-3 text-amber-400" />
                    <span className="font-mono font-semibold text-foreground text-xs">{key}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                      {t("tools.byAuthor", { author: n.author })}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                <div className="p-2 rounded bg-muted/30 text-xs whitespace-pre-wrap font-mono leading-relaxed border border-border/30">
                  {n.content}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Messages */}
      {tab === "messages" && (
        <div className="space-y-2">
          {messages.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground text-xs italic bg-muted/10 rounded-md">
              {t("tools.noMessages")}
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} className="rounded-md border border-border/40 bg-muted/20 p-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-semibold text-foreground">[{m.from}]</span>
                    <span>➜</span>
                    <span className="font-mono font-semibold text-primary">[{m.to}]</span>
                  </div>
                  <span className="font-mono">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                <div className="text-xs text-foreground/90 pl-1">{m.message}</div>
              </div>
            ))
          )}
        </div>
      )}

      {errorText && (
        <div className="p-2.5 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          {errorText}
        </div>
      )}
    </div>
  );
}

/* ----------------- Single Tool Item Row ----------------- */

export function CompactToolRow({ part }: { part: ToolPart }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const toolType = part.type as string;
  const toolName = toolType.startsWith("tool-") ? toolType.slice(5) : toolType;
  const inputObj = (part.input && typeof part.input === "object" ? part.input : {}) as Record<string, unknown>;

  const meta = useMemo(() => getToolMeta(toolName, part.input), [toolName, part.input]);
  const Icon = meta.icon;

  const isRunning = part.state === "input-available" || part.state === "input-streaming";
  const isError = part.state === "output-error" || !!part.errorText;
  const isDone = part.state === "output-available" && !isError;

  const outputStr = useMemo(() => parseOutputString(part.output), [part.output]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/tool w-full text-left">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-1.5 transition-colors cursor-pointer text-xs select-none",
          "hover:bg-accent/40 active:bg-accent/60",
          isRunning && "bg-primary/5 border-l-2 border-primary",
          isError && "bg-destructive/5 border-l-2 border-destructive",
          open && "bg-accent/30",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className={cn("size-3.5 shrink-0", meta.color)} />
          <span className="font-mono text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider shrink-0">
            {meta.name}
          </span>
          <span className="font-mono text-xs text-foreground/85 truncate flex-1 text-left">
            {meta.summary}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isRunning && (
            <div className="flex items-center gap-1 text-[11px] text-primary">
              <Loader2 className="size-3 animate-spin" />
              <span className="hidden sm:inline text-[10px] font-medium animate-pulse">{t("tools.running")}</span>
            </div>
          )}
          {isDone && (
            <Check className="size-3 text-emerald-500" />
          )}
          {isError && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" />
              <span className="text-[10px] font-semibold">{t("tools.error")}</span>
            </div>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]/tool:rotate-180" />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border/40 bg-muted/20 p-2.5">
        {toolName === "bash" && (
          <BashPayload
            command={String(inputObj.command ?? "")}
            output={outputStr}
            errorText={part.errorText}
          />
        )}
        {toolName === "edit" && (
          <EditPayload
            path={String(inputObj.path ?? "")}
            oldString={String(inputObj.oldString ?? "")}
            newString={String(inputObj.newString ?? "")}
            output={outputStr}
            errorText={part.errorText}
          />
        )}
        {(toolName === "read" || toolName === "write") && (
          <CodePayload
            path={String(inputObj.path ?? "")}
            content={toolName === "write" ? String(inputObj.content ?? outputStr) : outputStr}
            errorText={part.errorText}
          />
        )}
        {toolName === "subagent" && (
          <SubagentPayload
            agent={String(inputObj.agent ?? "subagent")}
            task={String(inputObj.prompt ?? inputObj.task ?? "")}
            output={outputStr}
            errorText={part.errorText}
          />
        )}
        {toolName === "swarm" && (
          <SwarmPayload
            input={inputObj}
            output={part.output}
            errorText={part.errorText}
          />
        )}
        {toolName !== "bash" && toolName !== "edit" && toolName !== "read" && toolName !== "write" && toolName !== "subagent" && toolName !== "swarm" && (
          <CodePayload
            path={meta.summary}
            content={outputStr || JSON.stringify(part.input, null, 2)}
            errorText={part.errorText}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ----------------- Grouped Tool Container ----------------- */

export function AgentActionGroup({ tools }: { tools: ToolPart[] }) {
  const { t } = useI18n();
  const isAnyRunning = tools.some((t) => t.state === "input-available" || t.state === "input-streaming");
  const hasError = tools.some((t) => t.state === "output-error" || !!t.errorText);

  if (tools.length === 1) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/60 overflow-hidden my-1.5 shadow-xs">
        <CompactToolRow part={tools[0]} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card/60 overflow-hidden my-2 shadow-xs">
      <div className="flex items-center justify-between px-3 py-1 bg-muted/30 border-b border-border/40 text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-1.5">
          <Terminal className="size-3 text-muted-foreground" />
          <span className="font-semibold text-foreground/80">
            {t("tools.agentActions", { count: tools.length })}
          </span>
          {isAnyRunning && (
            <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[9px] text-primary">
              <Loader2 className="size-2.5 animate-spin" /> {t("tools.running")}
            </Badge>
          )}
          {hasError && !isAnyRunning && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
              {t("tools.error")}
            </Badge>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {tools.map((part) => (
          <CompactToolRow key={part.toolCallId} part={part} />
        ))}
      </div>
    </div>
  );
}
