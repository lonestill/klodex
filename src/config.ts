import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HOME = homedir();

export const paths = {
  configDir: join(HOME, ".config", "klodex"),
  cacheDir: join(HOME, ".cache", "klodex"),
  dataDir: join(HOME, ".local", "share", "klodex"),
  skillsDir: join(HOME, ".config", "klodex", "skills"),
  promptsDir: join(HOME, ".config", "klodex", "prompts"),
  opencodeConfig: join(HOME, ".config", "opencode", "opencode.json"),
  opencodeAuth: join(HOME, ".local", "share", "opencode", "auth.json"),
  modelsDevCache: join(HOME, ".cache", "klodex", "models-dev.json"),
};

/** Strip // line comments and /* block comments from JSONC text without touching strings. */
export function stripJsonComments(src: string): string {
  let out = "";
  let i = 0;
  let inStr = false;
  let esc = false;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function parseJsonc<T = unknown>(text: string): T {
  return JSON.parse(stripJsonComments(text)) as T;
}

export type KlodexConfig = {
  port: number;
  defaultProvider?: string;
  defaultModel?: string;
  maxSteps: number;
  maxSubagentSteps: number;
  /** provider_id -> extra API keys, usable from the UI */
  auth: Record<string, string>;
  providers: Record<string, unknown>;
  systemPrompt?: string;
  providerSort?: "category" | "alpha" | "models";
  subagentModels?: { explore?: string; general?: string };
  /** try to read ~/.config/opencode config + auth for keys (default true) */
  importOpenCode?: boolean;
  firstRunCompleted?: boolean;
  updateRepo?: string;
  autoCheckUpdates?: boolean;
  skillsRepo?: string;
  enabledSkills?: string[];
  enabledPrompts?: string[];
};

const defaults: KlodexConfig = {
  port: 4545,
  maxSteps: 64,
  maxSubagentSteps: 32,
  auth: {},
  providers: {},
  providerSort: "category",
  skillsRepo: "lonestill/klodex-skills",
  enabledSkills: [],
  enabledPrompts: [],
};

function readJsonObject(file: string): Record<string, unknown> | null {
  try {
    const text = readFileSync(file, "utf8");
    return parseJsonc<Record<string, unknown>>(text);
  } catch {
    return null;
  }
}

let cached: KlodexConfig | null = null;

export function loadConfig(): KlodexConfig {
  if (cached) return cached;
  const raw = readJsonObject(join(paths.configDir, "config.jsonc")) ?? {};
  const cfg: KlodexConfig = {
    ...defaults,
    ...raw,
    auth: { ...(defaults.auth), ...((raw.auth as object) ?? {}) },
    providers: { ...defaults.providers, ...((raw.providers as object) ?? {}) },
  };
  if (cfg.importOpenCode !== false) {
    const oc = readJsonObject(paths.opencodeConfig);
    if (oc && oc.provider && typeof oc.provider === "object") {
      const prov = oc.provider as Record<string, unknown>;
      for (const [id, val] of Object.entries(prov)) {
        if (!(id in cfg.providers)) cfg.providers[id] = val;
      }
    }
  }
  cached = cfg;
  return cfg;
}

export function saveProviderKey(provider: string, key: string) {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  raw.auth = { ...((raw.auth as object) ?? {}), [provider]: key } as Record<string, unknown>;
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  loadConfig();
}

export type SettingsPatch = {
  defaultProvider?: string;
  defaultModel?: string;
  maxSteps?: number;
  maxSubagentSteps?: number;
  systemPrompt?: string;
  providerSort?: "category" | "alpha" | "models";
  subagentModels?: { explore?: string; general?: string };
  firstRunCompleted?: boolean;
  updateRepo?: string;
  autoCheckUpdates?: boolean;
  skillsRepo?: string;
  enabledSkills?: string[];
  enabledPrompts?: string[];
};

const SETTING_KEYS = [
  "defaultProvider",
  "defaultModel",
  "maxSteps",
  "maxSubagentSteps",
  "systemPrompt",
  "providerSort",
  "subagentModels",
  "firstRunCompleted",
  "updateRepo",
  "autoCheckUpdates",
  "skillsRepo",
  "enabledSkills",
  "enabledPrompts",
];

export function saveSettings(patch: SettingsPatch): KlodexConfig {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  for (const k of SETTING_KEYS) {
    if (patch[k as keyof SettingsPatch] !== undefined) {
      const val = patch[k as keyof SettingsPatch];
      if (k === "systemPrompt" && typeof val === "string" && !val.trim()) {
        delete raw[k];
      } else {
        raw[k] = val;
      }
    }
  }
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  return loadConfig();
}

