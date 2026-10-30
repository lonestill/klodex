import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const HOME = homedir();
const isWin = process.platform === "win32";

function resolveConfigDir(): string {
  const legacy = join(HOME, ".config", "klodex");
  if (existsSync(legacy)) return legacy;
  if (isWin) {
    const appData = process.env.APPDATA || join(HOME, "AppData", "Roaming");
    return join(appData, "klodex");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "klodex");
  return legacy;
}

function resolveDataDir(): string {
  const legacy = join(HOME, ".local", "share", "klodex");
  if (existsSync(legacy)) return legacy;
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || join(HOME, "AppData", "Local");
    return join(localAppData, "klodex");
  }
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "klodex");
  return legacy;
}

function resolveCacheDir(): string {
  const legacy = join(HOME, ".cache", "klodex");
  if (existsSync(legacy)) return legacy;
  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || join(HOME, "AppData", "Local");
    return join(localAppData, "klodex", "cache");
  }
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return join(xdg, "klodex");
  return legacy;
}

function findFirstExistingPath(candidates: string[]): string {
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {}
  }
  return candidates[0]!;
}

const configDir = resolveConfigDir();
const dataDir = resolveDataDir();
const cacheDir = resolveCacheDir();

export const paths = {
  configDir,
  cacheDir,
  dataDir,
  skillsDir: join(configDir, "skills"),
  promptsDir: join(configDir, "prompts"),
  get opencodeConfig(): string {
    return findFirstExistingPath([
      join(HOME, ".config", "opencode", "opencode.json"),
      ...(process.env.APPDATA ? [join(process.env.APPDATA, "opencode", "opencode.json")] : []),
      join(HOME, "AppData", "Roaming", "opencode", "opencode.json"),
      join(HOME, ".opencode", "opencode.json"),
    ]);
  },
  get opencodeAuth(): string {
    return findFirstExistingPath([
      join(HOME, ".local", "share", "opencode", "auth.json"),
      ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, "opencode", "auth.json")] : []),
      join(HOME, "AppData", "Local", "opencode", "auth.json"),
      join(HOME, ".config", "opencode", "auth.json"),
    ]);
  },
  modelsDevCache: join(cacheDir, "models-dev.json"),
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
  subagentModels?: { explore?: string; general?: string; coder?: string; tester?: string };
  /** try to read ~/.config/opencode config + auth for keys (default true) */
  importOpenCode?: boolean;
  firstRunCompleted?: boolean;
  updateRepo?: string;
  autoCheckUpdates?: boolean;
  skillsRepo?: string;
  enabledSkills?: string[];
  enabledPrompts?: string[];
  disabledProviders?: string[];
  disabledModels?: string[];
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
  disabledProviders: [],
  disabledModels: [],
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
  const auth = { ...((raw.auth as object) ?? {}), [provider]: key } as Record<string, any>;

  // If this is a tagflow email:password, also add/update in tagflow_accounts pool
  if (provider === "tagflow" && key.includes(":") && !key.startsWith("eyJ")) {
    const colonIdx = key.indexOf(":");
    const email = key.slice(0, colonIdx).trim();
    const password = key.slice(colonIdx + 1).trim();
    if (email && password) {
      const list: TagflowAccount[] = Array.isArray(auth.tagflow_accounts) ? [...auth.tagflow_accounts] : [];
      const existingIdx = list.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx]!, password };
      } else {
        list.unshift({ email, password, createdAt: Date.now() });
      }
      auth.tagflow_accounts = list;
    }
  }

  raw.auth = auth;
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  loadConfig();
}

export type TagflowAccount = {
  email: string;
  password?: string;
  createdAt: number;
};

export function saveTagflowAccount(account: { email: string; password: string }) {
  saveProviderKey("tagflow", `${account.email}:${account.password}`);
}

export function listTagflowAccounts(): {
  accounts: Array<{ email: string; createdAt: number; active: boolean }>;
  activeEmail: string | null;
} {
  const cfg = loadConfig();
  const rawAuth = (cfg.auth as Record<string, any>) ?? {};
  const list: TagflowAccount[] = Array.isArray(rawAuth.tagflow_accounts) ? rawAuth.tagflow_accounts : [];
  const currentKey = typeof rawAuth.tagflow === "string" ? rawAuth.tagflow : "";
  const activeEmail = currentKey.includes(":") ? currentKey.split(":")[0]!.trim().toLowerCase() : null;

  return {
    accounts: list.map((a) => ({
      email: a.email,
      createdAt: a.createdAt,
      active: activeEmail ? a.email.toLowerCase() === activeEmail : false,
    })),
    activeEmail,
  };
}

export function switchTagflowAccount(email: string): boolean {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  const auth = (raw.auth as Record<string, any>) ?? {};
  const list: TagflowAccount[] = Array.isArray(auth.tagflow_accounts) ? auth.tagflow_accounts : [];
  const found = list.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!found || !found.password) return false;

  auth.tagflow = `${found.email}:${found.password}`;
  raw.auth = auth;
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  loadConfig();
  return true;
}

export function deleteTagflowAccount(email: string) {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  const auth = (raw.auth as Record<string, any>) ?? {};
  let list: TagflowAccount[] = Array.isArray(auth.tagflow_accounts) ? auth.tagflow_accounts : [];
  list = list.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
  auth.tagflow_accounts = list;

  const currentKey = typeof auth.tagflow === "string" ? auth.tagflow : "";
  if (
    currentKey.toLowerCase() === email.toLowerCase() ||
    currentKey.toLowerCase().startsWith(email.toLowerCase() + ":")
  ) {
    const first = list[0];
    if (first?.password) {
      auth.tagflow = `${first.email}:${first.password}`;
    } else {
      delete auth.tagflow;
    }
  }
  raw.auth = auth;
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  loadConfig();
}

export function saveProviderOptions(provider: string, options: { baseURL?: string }) {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  const providers = (raw.providers as Record<string, any>) ?? {};
  const prov = (providers[provider] as Record<string, any>) ?? {};
  const currentOptions = (prov.options as Record<string, any>) ?? {};

  if (options.baseURL !== undefined) {
    const trimmed = options.baseURL.trim();
    if (trimmed) {
      currentOptions.baseURL = trimmed;
    } else {
      delete currentOptions.baseURL;
    }
  }

  prov.options = currentOptions;
  providers[provider] = prov;
  raw.providers = providers;
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
  subagentModels?: { explore?: string; general?: string; coder?: string; tester?: string };
  importOpenCode?: boolean;
  firstRunCompleted?: boolean;
  updateRepo?: string;
  autoCheckUpdates?: boolean;
  skillsRepo?: string;
  enabledSkills?: string[];
  enabledPrompts?: string[];
  disabledProviders?: string[];
  disabledModels?: string[];
};

const SETTING_KEYS = [
  "defaultProvider",
  "defaultModel",
  "maxSteps",
  "maxSubagentSteps",
  "systemPrompt",
  "providerSort",
  "subagentModels",
  "importOpenCode",
  "firstRunCompleted",
  "updateRepo",
  "autoCheckUpdates",
  "skillsRepo",
  "enabledSkills",
  "enabledPrompts",
  "disabledProviders",
  "disabledModels",
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

export type CustomProviderInput = {
  id: string;
  name?: string;
  baseURL: string;
  apiKey?: string;
  models?: Array<{ id: string; name?: string; contextWindow?: number; free?: boolean } | string>;
};

export function saveCustomProvider(input: CustomProviderInput): string {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  const providers = (raw.providers as Record<string, any>) ?? {};
  const auth = (raw.auth as Record<string, any>) ?? {};

  const cleanId = (input.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "custom";
  const name = (input.name || cleanId).trim();
  const baseURL = (input.baseURL || "").trim().replace(/\/+$/, "");

  const modelsMap: Record<string, any> = {};
  if (Array.isArray(input.models) && input.models.length > 0) {
    for (const m of input.models) {
      if (typeof m === "string") {
        const mid = m.trim();
        if (mid) modelsMap[mid] = { name: mid, free: true };
      } else if (m && typeof m === "object" && m.id) {
        modelsMap[m.id.trim()] = {
          name: (m.name || m.id).trim(),
          contextWindow: m.contextWindow,
          free: m.free ?? true,
        };
      }
    }
  }

  // If no models were given, supply default fallback model named after provider
  if (Object.keys(modelsMap).length === 0) {
    modelsMap[cleanId] = { name, free: true };
  }

  providers[cleanId] = {
    name,
    npm: "@ai-sdk/openai-compatible",
    options: {
      baseURL,
    },
    models: modelsMap,
    custom: true,
  };

  const keyVal = (input.apiKey ?? "").trim();
  if (keyVal) {
    auth[cleanId] = keyVal;
  } else if (!auth[cleanId]) {
    auth[cleanId] = "public";
  }

  raw.providers = providers;
  raw.auth = auth;
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  cached = null;
  loadConfig();
  return cleanId;
}

export function deleteCustomProvider(id: string): boolean {
  mkdirSync(paths.configDir, { recursive: true });
  const file = join(paths.configDir, "config.jsonc");
  const raw = readJsonObject(file) ?? {};
  const providers = (raw.providers as Record<string, any>) ?? {};
  const auth = (raw.auth as Record<string, any>) ?? {};

  const cleanId = (id || "").trim().toLowerCase();
  if (cleanId in providers) {
    delete providers[cleanId];
    delete auth[cleanId];
    raw.providers = providers;
    raw.auth = auth;
    writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
    cached = null;
    loadConfig();
    return true;
  }
  return false;
}
