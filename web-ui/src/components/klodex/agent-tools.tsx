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
    case "subagent":
      return {
        name: "subagent",
        icon: Bot,
        color: "text-fuchsia-400",
        summary: i.task ? `[${String(i.agent || "agent")}] ${String(i.task)}` : "subagent task",
      };
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
          title="Копировать команду"
        >
          {copiedCmd ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </Button>
      </div>

      {(output || errorText) && (
        <div className="relative group/term rounded-md bg-zinc-950 p-2.5 text-[11px] leading-relaxed text-zinc-200 border border-zinc-900 max-h-64 overflow-auto">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-5 bg-zinc-900/90 text-zinc-400 hover:text-zinc-100 opacity-0 group-hover/term:opacity-100 transition-opacity"
            onClick={() => copyOut(errorText || output)}
            title="Копировать вывод"
          >
            {copiedOut ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </Button>
          <pre className={cn("whitespace-pre-wrap break-all", errorText && "text-rose-400")}>
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
  const { copied, copy } = useCopy();

  return (
    <div className="space-y-2 font-mono text-xs">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1 border-b border-border/40">
        <span className="font-semibold text-foreground/90 truncate">{path}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-muted-foreground hover:text-foreground"
          onClick={() => copy(`--- ${path}\n+++ ${path}\n- ${oldString}\n+ ${newString}`)}
          title="Копировать diff"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </Button>
      </div>

      {oldString && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-rose-500 tracking-wider">
            <Minus className="size-3" /> Удалено
          </div>
          <pre className="rounded bg-rose-500/10 border-l-2 border-rose-500/70 p-2 text-[11px] text-rose-300 overflow-x-auto whitespace-pre max-h-40">
            {oldString}
          </pre>
        </div>
      )}

      {newString && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-500 tracking-wider">
            <Plus className="size-3" /> Добавлено
          </div>
          <pre className="rounded bg-emerald-500/10 border-l-2 border-emerald-500/70 p-2 text-[11px] text-emerald-300 overflow-x-auto whitespace-pre max-h-40">
            {newString}
          </pre>
        </div>
      )}

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
            title="Копировать содержимое"
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
            title="Копировать"
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
  return (
    <div className="space-y-2 text-xs">
      <div className="rounded bg-muted/30 p-2 border border-border/40">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Агент: <span className="text-foreground">{agent}</span>
        </div>
        <div className="text-xs text-foreground/90 mt-0.5">{task}</div>
      </div>
      {(output || errorText) && (
        <div className={cn("p-2 rounded bg-background/60 border border-border/40 text-xs", errorText && "text-destructive")}>
          {errorText ? (
            <pre className="whitespace-pre-wrap">{errorText}</pre>
          ) : (
            <Streamdown>{output}</Streamdown>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------- Single Tool Item Row ----------------- */

export function CompactToolRow({ part }: { part: ToolPart }) {
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
              <span className="hidden sm:inline text-[10px] font-medium animate-pulse">выполняется</span>
            </div>
          )}
          {isDone && (
            <Check className="size-3 text-emerald-500" />
          )}
          {isError && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" />
              <span className="text-[10px] font-semibold">ошибка</span>
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
            task={String(inputObj.task ?? "")}
            output={outputStr}
            errorText={part.errorText}
          />
        )}
        {toolName !== "bash" && toolName !== "edit" && toolName !== "read" && toolName !== "write" && toolName !== "subagent" && (
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
  const [allOpen, setAllOpen] = useState(false);
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
            Действия агента ({tools.length})
          </span>
          {isAnyRunning && (
            <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[9px] text-primary">
              <Loader2 className="size-2.5 animate-spin" /> выполняется
            </Badge>
          )}
          {hasError && !isAnyRunning && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
              ошибка
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
