import type { LucideIcon } from "lucide-react";
import type { KlodexProvider, ProviderSort } from "@/lib/api";

export type SettingsTab = "general" | "provider" | "keys" | "agent" | "stats" | "updates";

export interface TabConfigItem {
  id: SettingsTab;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: KlodexProvider[];
  onCatalogRefresh: () => Promise<void>;
  selected: { provider: string; model: string } | null;
  onSelectedChange: (sel: { provider: string; model: string }) => void;
  providerSort?: ProviderSort;
  onProviderSortChange?: (sort: ProviderSort) => void;
  initialTab?: SettingsTab;
}

export function applyTheme(t: "dark" | "light" | "system") {
  const root = document.documentElement;
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function formatTokensNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  return (n || 0).toLocaleString();
}
