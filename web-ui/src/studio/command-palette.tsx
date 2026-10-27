import { useEffect } from "react";
import { Boxes, Cog, MessageSquare, Moon, Plus, Sparkles, Sun } from "lucide-react";
import type { UIMessage } from "ai";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { KlodexProvider, SessionRow } from "@/lib/api";

export interface PaletteAction {
  id: string;
  label: string;
  icon: "new" | "skills" | "settings" | "theme" | "agents" | "workspace";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionRow[];
  catalog: KlodexProvider[];
  selected: { provider: string; model: string } | null;
  activeSessionIds: string[];
  theme: "dark" | "light";
  onOpenSession: (id: string) => void;
  onNewChat: () => void;
  onOpenCatalog: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  onSwitchModel: (provider: string, model: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  sessions,
  catalog,
  selected,
  activeSessionIds,
  theme,
  onOpenSession,
  onNewChat,
  onOpenCatalog,
  onOpenSettings,
  onToggleTheme,
  onSwitchModel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const readyModels: Array<{ provider: string; providerName: string; id: string; name: string; free?: boolean }> = [];
  for (const p of catalog) {
    const ready = Boolean(p.hasKey || p.status === "keyless" || p.status === "local" || p.status === "ready");
    if (!ready) continue;
    for (const m of p.models.slice(0, 8)) {
      readyModels.push({ provider: p.id, providerName: p.name, id: m.id, name: m.name || m.id, free: m.free });
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-xl rounded-2xl! border-border/60 bg-popover/90 backdrop-blur-xl shadow-2xl"
    >
      <Command>
        <CommandInput placeholder="Search chats, models, actions…" />
        <CommandList className="chat-scroll max-h-[420px]">
          <CommandEmpty>Nothing found</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={onNewChat} className="cursor-pointer gap-2">
              <Plus className="size-4" /> New chat
            </CommandItem>
            <CommandItem onSelect={onOpenCatalog} className="cursor-pointer gap-2">
              <Boxes className="size-4" /> Skills & Prompts
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                window.dispatchEvent(new Event("klodex:openV2Intro"));
              }}
              className="cursor-pointer gap-2"
            >
              <Sparkles className="size-4 text-primary" /> What's new in Studio v2
            </CommandItem>
            <CommandItem onSelect={onOpenSettings} className="cursor-pointer gap-2">
              <Cog className="size-4" /> Settings
            </CommandItem>
            <CommandItem onSelect={onToggleTheme} className="cursor-pointer gap-2">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </CommandItem>
          </CommandGroup>
          {sessions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Chats">
                {sessions.slice(0, 10).map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`chat ${s.title ?? ""} ${s.id}`}
                    onSelect={() => onOpenSession(s.id)}
                    className="cursor-pointer gap-2"
                  >
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <span className="truncate flex-1">{s.title ?? s.id.slice(0, 8)}</span>
                    {activeSessionIds.includes(s.id) && (
                      <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {readyModels.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Models">
                {readyModels.map((m) => (
                  <CommandItem
                    key={`${m.provider}/${m.id}`}
                    value={`model ${m.providerName} ${m.name} ${m.id}`}
                    onSelect={() => onSwitchModel(m.provider, m.id)}
                    className="cursor-pointer gap-2"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        selected?.provider === m.provider && selected?.model === m.id ? "bg-primary" : "bg-border",
                      )}
                    />
                    <span className="truncate font-mono text-xs">{m.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{m.providerName}</span>
                    {m.free && (
                      <span className="ml-auto rounded border border-emerald-500/30 px-1 font-mono text-[9px] text-emerald-500">
                        free
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// Re-export UIMessage type usage guard to keep imports tidy
export type { UIMessage };
