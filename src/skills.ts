import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig, paths, saveSettings } from "./config.ts";

export type PromptType = "system" | "user" | "composite";

export type SkillMeta = {
  id: string;
  name: string;
  description: string;
  category?: string;
  version?: string;
  author?: string;
  triggers?: string[];
  tags?: string[];
  path?: string;
  always_active?: boolean;
  body?: string;
  isInstalled?: boolean;
  isEnabled?: boolean;
  isProjectLevel?: boolean;
  localPath?: string;
};

export type PromptMeta = {
  id: string;
  name: string;
  type: PromptType;
  slash?: string;
  category?: string;
  version?: string;
  author?: string;
  description: string;
  tags?: string[];
  path?: string;
  systemContent?: string;
  userContent?: string;
  rawBody?: string;
  isInstalled?: boolean;
  isEnabled?: boolean;
  isProjectLevel?: boolean;
  localPath?: string;
};

export type RegistryCategory = {
  id: string;
  name: string;
};

export type RegistryData = {
  version: string;
  updatedAt: string;
  categories: RegistryCategory[];
  skills: SkillMeta[];
  prompts: PromptMeta[];
};

// Simple Frontmatter Parser (YAML-like key: value / list)
export function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: content };
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    return { meta: {}, body: content };
  }

  const rawMeta = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();
  const meta: Record<string, any> = {};

  for (const line of rawMeta.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();

    // Parse booleans and numbers
    if (val === "true") meta[key] = true;
    else if (val === "false") meta[key] = false;
    else if (!isNaN(Number(val)) && val !== "") meta[key] = Number(val);
    else if (val.startsWith("[") && val.endsWith("]")) {
      // JSON array
      try {
        meta[key] = JSON.parse(val);
      } catch {
        meta[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
      }
    } else {
      meta[key] = val.replace(/^['"]|['"]$/g, "");
    }
  }

  return { meta, body };
}

// Split prompt body for system / user / composite
export function parsePromptContent(body: string, type: PromptType): { systemContent?: string; userContent?: string } {
  if (type === "system") {
    return { systemContent: body.trim() };
  }
  if (type === "user") {
    return { userContent: body.trim() };
  }

  // Composite: split by <!-- system --> / <!-- user --> or ## System / ## User
  let sys = "";
  let usr = "";

  if (body.includes("<!-- system -->") || body.includes("<!-- user -->")) {
    const sysMatch = body.match(/<!--\s*system\s*-->([\s\S]*?)(?:<!--\s*user\s*-->|$)/i);
    const usrMatch = body.match(/<!--\s*user\s*-->([\s\S]*?)(?:<!--\s*system\s*-->|$)/i);
    sys = sysMatch && sysMatch[1] ? sysMatch[1].trim() : "";
    usr = usrMatch && usrMatch[1] ? usrMatch[1].trim() : "";
  } else if (/##\s*system/i.test(body) && /##\s*user/i.test(body)) {
    const parts = body.split(/##\s*user/i);
    const sysPart = (parts[0] ?? "").replace(/##\s*system/i, "");
    sys = sysPart.trim();
    usr = (parts[1] ?? "").trim();
  } else {
    // Fallback: first half / second half or whole body as user
    usr = body.trim();
  }

  return { systemContent: sys, userContent: usr };
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// --------------------------------------------------------------------------
// Local Scanning
// --------------------------------------------------------------------------

export function listInstalledSkills(projectDir?: string): SkillMeta[] {
  const cfg = loadConfig();
  const enabledSet = new Set(cfg.enabledSkills ?? []);
  const skills: SkillMeta[] = [];
  const seenIds = new Set<string>();

  // 1. Project-level: .klodex/skills/
  if (projectDir) {
    const projSkillsDir = join(projectDir, ".klodex", "skills");
    if (existsSync(projSkillsDir)) {
      scanSkillsDir(projSkillsDir, true, skills, seenIds, enabledSet);
    }
  }

  // 2. Global: ~/.config/klodex/skills/
  ensureDir(paths.skillsDir);
  scanSkillsDir(paths.skillsDir, false, skills, seenIds, enabledSet);

  return skills;
}

function scanSkillsDir(
  dir: string,
  isProject: boolean,
  out: SkillMeta[],
  seen: Set<string>,
  enabledSet: Set<string>,
) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);
      let skillFile = "";

      if (st.isDirectory()) {
        const candidate = join(full, "SKILL.md");
        if (existsSync(candidate)) skillFile = candidate;
      } else if (entry.endsWith(".md")) {
        skillFile = full;
      }

      if (!skillFile) continue;

      try {
        const content = readFileSync(skillFile, "utf8");
        const { meta, body } = parseFrontmatter(content);
        const id = meta.name || meta.id || entry.replace(/\.md$/, "");
        if (seen.has(id)) continue;
        seen.add(id);

        out.push({
          id,
          name: meta.name || id,
          description: meta.description || "",
          category: meta.category || "general",
          version: String(meta.version || "1.0.0"),
          author: meta.author || "local",
          triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          always_active: Boolean(meta.always_active),
          body,
          isInstalled: true,
          isEnabled: isProject ? true : enabledSet.has(id),
          isProjectLevel: isProject,
          localPath: skillFile,
        });
      } catch {}
    }
  } catch {}
}

export function listInstalledPrompts(projectDir?: string): PromptMeta[] {
  const cfg = loadConfig();
  const enabledSet = new Set(cfg.enabledPrompts ?? []);
  const prompts: PromptMeta[] = [];
  const seenIds = new Set<string>();

  // 1. Project-level: .klodex/prompts/
  if (projectDir) {
    const projPromptsDir = join(projectDir, ".klodex", "prompts");
    if (existsSync(projPromptsDir)) {
      scanPromptsDir(projPromptsDir, true, prompts, seenIds, enabledSet);
    }
  }

  // 2. Global: ~/.config/klodex/prompts/
  ensureDir(paths.promptsDir);
  scanPromptsDir(paths.promptsDir, false, prompts, seenIds, enabledSet);

  return prompts;
}

function scanPromptsDir(
  dir: string,
  isProject: boolean,
  out: PromptMeta[],
  seen: Set<string>,
  enabledSet: Set<string>,
) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const st = statSync(full);

      if (st.isDirectory()) {
        scanPromptsDir(full, isProject, out, seen, enabledSet);
        continue;
      }

      if (!entry.endsWith(".md")) continue;

      try {
        const content = readFileSync(full, "utf8");
        const { meta, body } = parseFrontmatter(content);
        const id = meta.id || entry.replace(/\.md$/, "");
        if (seen.has(id)) continue;
        seen.add(id);

        const type: PromptType = (meta.type as PromptType) || "user";
        const { systemContent, userContent } = parsePromptContent(body, type);

        out.push({
          id,
          name: meta.name || id,
          type,
          slash: meta.slash || (type !== "system" ? `/${id}` : undefined),
          category: meta.category || "general",
          version: String(meta.version || "1.0.0"),
          author: meta.author || "local",
          description: meta.description || "",
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          systemContent,
          userContent,
          rawBody: body,
          isInstalled: true,
          isEnabled: isProject ? true : enabledSet.has(id),
          isProjectLevel: isProject,
          localPath: full,
        });
      } catch {}
    }
  } catch {}
}

// --------------------------------------------------------------------------
// Registry Fetching & Caching
// --------------------------------------------------------------------------

let cachedRegistry: RegistryData | null = null;
let lastRegistryFetch = 0;
const REGISTRY_TTL = 300_000; // 5 minutes

export async function fetchRegistry(force = false): Promise<RegistryData> {
  const now = Date.now();
  const klodexSkillsDir = join(process.env.HOME || "", "klodex-skills");
  const localRegistry = join(klodexSkillsDir, "registry.json");
  const gitDir = join(klodexSkillsDir, ".git");

  if (!force && cachedRegistry && now - lastRegistryFetch < REGISTRY_TTL) {
    return cachedRegistry;
  }

  if (!force && existsSync(localRegistry)) {
    try {
      const data = JSON.parse(readFileSync(localRegistry, "utf8")) as RegistryData;
      cachedRegistry = data;
      lastRegistryFetch = now;
      return data;
    } catch {}
  }

  const prevCached = cachedRegistry;

  if (force) {
    cachedRegistry = null;
    if (existsSync(gitDir)) {
      try {
        execSync("git pull --ff-only", {
          cwd: klodexSkillsDir,
          timeout: 8000,
          stdio: "ignore",
        });
      } catch {
        // Safe catch: offline or detached HEAD or conflicts, continue to network fetch
      }
      if (existsSync(localRegistry)) {
        try {
          const data = JSON.parse(readFileSync(localRegistry, "utf8")) as RegistryData;
          if (data && Array.isArray(data.prompts) && data.prompts.length > 0) {
            cachedRegistry = data;
            lastRegistryFetch = now;
            return data;
          }
        } catch {}
      }
    }
  }

  const cfg = loadConfig();
  const repo = cfg.skillsRepo || "lonestill/klodex-skills";
  const url = `https://raw.githubusercontent.com/${repo}/main/registry.json?t=${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Klodex-Client",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = (await res.json()) as RegistryData;
    cachedRegistry = data;
    lastRegistryFetch = now;

    if (existsSync(localRegistry)) {
      try {
        writeFileSync(localRegistry, JSON.stringify(data, null, 2), "utf8");
      } catch {}
    }

    return data;
  } catch (e) {
    // Fallback if offline: try reading ~/klodex-skills/registry.json
    if (existsSync(localRegistry)) {
      try {
        const localData = JSON.parse(readFileSync(localRegistry, "utf8")) as RegistryData;
        cachedRegistry = localData;
        lastRegistryFetch = now;
        return localData;
      } catch {}
    }
    // Fallback to previous cache if available
    if (prevCached) {
      cachedRegistry = prevCached;
      return prevCached;
    }
    if (cachedRegistry) return cachedRegistry;
    return {
      version: "1.0.0",
      updatedAt: new Date().toISOString().slice(0, 10),
      categories: [
        { id: "architecture", name: "Архитектура и Аудит" },
        { id: "code", name: "Разработка и Код" },
        { id: "security", name: "Безопасность" },
        { id: "writing", name: "Текст и Документация" },
      ],
      skills: [],
      prompts: [],
    };
  }
}

export async function getFullCatalog(projectDir?: string, force = false) {
  const registry = await fetchRegistry(force);
  const installedSkills = listInstalledSkills(projectDir);
  const installedPrompts = listInstalledPrompts(projectDir);

  const installedSkillMap = new Map(installedSkills.map((s) => [s.id, s]));
  const installedPromptMap = new Map(installedPrompts.map((p) => [p.id, p]));

  // Merge registry items with install state
  const skillsWithState = registry.skills.map((s) => {
    const inst = installedSkillMap.get(s.id);
    return {
      ...s,
      isInstalled: Boolean(inst),
      isEnabled: inst ? inst.isEnabled : false,
      localPath: inst?.localPath,
    };
  });

  // Add local skills not in registry
  for (const s of installedSkills) {
    if (!registry.skills.some((rs) => rs.id === s.id)) {
      skillsWithState.push({
        ...s,
        isInstalled: true,
        isEnabled: s.isEnabled ?? false,
        localPath: s.localPath,
      });
    }
  }

  const promptsWithState = registry.prompts.map((p) => {
    const inst = installedPromptMap.get(p.id);
    return {
      ...p,
      isInstalled: Boolean(inst),
      isEnabled: inst ? inst.isEnabled : false,
      localPath: inst?.localPath,
    };
  });

  // Add local prompts not in registry
  for (const p of installedPrompts) {
    if (!registry.prompts.some((rp) => rp.id === p.id)) {
      promptsWithState.push({
        ...p,
        isInstalled: true,
        isEnabled: p.isEnabled ?? false,
        localPath: p.localPath,
      });
    }
  }

  return {
    categories: registry.categories,
    skills: skillsWithState,
    prompts: promptsWithState,
    updatedAt: registry.updatedAt,
  };
}

// --------------------------------------------------------------------------
// Install / Uninstall / Toggle
// --------------------------------------------------------------------------

export async function installCatalogItem(
  itemType: "skill" | "prompt",
  id: string,
  remotePath: string,
): Promise<{ ok: boolean; message?: string }> {
  const cfg = loadConfig();
  const repo = cfg.skillsRepo || "lonestill/klodex-skills";
  const url = `https://raw.githubusercontent.com/${repo}/main/${remotePath}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Klodex-Client" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();

    if (itemType === "skill") {
      const targetDir = join(paths.skillsDir, id);
      ensureDir(targetDir);
      writeFileSync(join(targetDir, "SKILL.md"), text, "utf8");

      const list = new Set(cfg.enabledSkills ?? []);
      list.add(id);
      saveSettings({ enabledSkills: Array.from(list) });
    } else {
      ensureDir(paths.promptsDir);
      // Determine folder or save directly
      const sub = remotePath.includes("prompts/system")
        ? "system"
        : remotePath.includes("prompts/composite")
        ? "composite"
        : "user";
      const targetDir = join(paths.promptsDir, sub);
      ensureDir(targetDir);
      writeFileSync(join(targetDir, `${id}.md`), text, "utf8");

      const list = new Set(cfg.enabledPrompts ?? []);
      list.add(id);
      saveSettings({ enabledPrompts: Array.from(list) });
    }

    return { ok: true, message: `Успешно установлено: ${id}` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

export function uninstallCatalogItem(itemType: "skill" | "prompt", id: string): { ok: boolean; message?: string } {
  const cfg = loadConfig();

  if (itemType === "skill") {
    const targetDir = join(paths.skillsDir, id);
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    const singleFile = join(paths.skillsDir, `${id}.md`);
    if (existsSync(singleFile)) {
      rmSync(singleFile, { force: true });
    }

    const list = new Set(cfg.enabledSkills ?? []);
    list.delete(id);
    saveSettings({ enabledSkills: Array.from(list) });
  } else {
    // Check in subdirs or root
    for (const sub of ["", "system", "user", "composite"]) {
      const fp = join(paths.promptsDir, sub, `${id}.md`);
      if (existsSync(fp)) {
        rmSync(fp, { force: true });
      }
    }
    const list = new Set(cfg.enabledPrompts ?? []);
    list.delete(id);
    saveSettings({ enabledPrompts: Array.from(list) });
  }

  return { ok: true };
}

export function toggleCatalogItem(itemType: "skill" | "prompt", id: string, enabled: boolean): { ok: boolean } {
  const cfg = loadConfig();

  if (itemType === "skill") {
    const list = new Set(cfg.enabledSkills ?? []);
    if (enabled) list.add(id);
    else list.delete(id);
    saveSettings({ enabledSkills: Array.from(list) });
  } else {
    const list = new Set(cfg.enabledPrompts ?? []);
    if (enabled) list.add(id);
    else list.delete(id);
    saveSettings({ enabledPrompts: Array.from(list) });
  }

  return { ok: true };
}

// --------------------------------------------------------------------------
// Runtime Integration (Agent & Chat)
// --------------------------------------------------------------------------

export type SlashCommandItem = {
  slash: string;
  id: string;
  name: string;
  type: string;
  description: string;
  userContent?: string;
  systemContent?: string;
  isStock?: boolean;
};

export const STOCK_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    slash: "/clear",
    id: "clear",
    name: "Очистить чат",
    type: "action",
    description: "Сбросить историю сообщений и начать чистую сессию",
    isStock: true,
  },
  {
    slash: "/new",
    id: "new",
    name: "Новая сессия",
    type: "action",
    description: "Создать новую сессию диалога",
    isStock: true,
  },
  {
    slash: "/project",
    id: "project",
    name: "Выбрать папку проекта",
    type: "action",
    description: "Открыть системный диалог выбора рабочей папки",
    isStock: true,
  },
  {
    slash: "/stop",
    id: "stop",
    name: "Остановить агента",
    type: "action",
    description: "Прервать текущую генерацию или выполнение инструментов",
    isStock: true,
  },
  {
    slash: "/monitor",
    id: "monitor",
    name: "Монитор телеметрии",
    type: "action",
    description: "Показать или скрыть боковую панель монитора агента",
    isStock: true,
  },
  {
    slash: "/copy",
    id: "copy",
    name: "Скопировать ответ",
    type: "action",
    description: "Скопировать текст последнего ответа ассистента в буфер",
    isStock: true,
  },
  {
    slash: "/export",
    id: "export",
    name: "Экспорт сессии",
    type: "action",
    description: "Сохранить историю переписки в Markdown-файл",
    isStock: true,
  },
  {
    slash: "/settings",
    id: "settings",
    name: "Настройки",
    type: "action",
    description: "Открыть настройки провайдеров, ключей и приложения",
    isStock: true,
  },
  {
    slash: "/skills",
    id: "skills",
    name: "Каталог расширений",
    type: "action",
    description: "Перейти в каталог скиллов и промптов",
    isStock: true,
  },
  {
    slash: "/help",
    id: "help",
    name: "Справка по командам",
    type: "action",
    description: "Показать локальную справку по горячим клавишам и командам",
    isStock: true,
  },
  {
    slash: "/compact",
    id: "compact",
    name: "Сжать контекст",
    type: "action",
    description: "Сжать историю текущей сессии и очистить вывод старых инструментов",
    isStock: true,
  },
];

export function getSlashCommands(projectDir?: string): SlashCommandItem[] {
  const stock = [...STOCK_SLASH_COMMANDS];
  const prompts = listInstalledPrompts(projectDir);

  const custom: SlashCommandItem[] = prompts
    .filter((p) => p.isEnabled && p.slash)
    .map((p) => ({
      slash: p.slash!,
      id: p.id,
      name: p.name,
      type: p.type,
      description: p.description,
      userContent: p.userContent,
      systemContent: p.systemContent,
      isStock: false,
    }));

  // Merge stock + custom (custom prompt overrides stock if same slash is declared)
  const map = new Map<string, SlashCommandItem>();
  for (const item of stock) map.set(item.slash.toLowerCase(), item);
  for (const item of custom) map.set(item.slash.toLowerCase(), item);

  return Array.from(map.values());
}

export type PromptResolution = {
  finalUserText: string;
  systemInjection?: string;
  triggeredPrompt?: PromptMeta;
};

export function resolvePromptExecution(rawUserText: string, projectDir?: string): PromptResolution {
  const text = rawUserText.trim();
  if (!text.startsWith("/")) {
    return { finalUserText: rawUserText };
  }

  const slashMatch = text.match(/^(\/[a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!slashMatch) {
    return { finalUserText: rawUserText };
  }

  const cmd = (slashMatch[1] ?? "").toLowerCase();
  const args = slashMatch[2]?.trim() || "";

  const allCommands = getSlashCommands(projectDir);
  const matched = allCommands.find((c) => c.slash.toLowerCase() === cmd);

  if (!matched) {
    return { finalUserText: rawUserText };
  }

  // Stock action commands are handled client-side; never treat them as LLM prompts
  if (matched.type === "action" || matched.isStock) {
    return { finalUserText: rawUserText };
  }

  // Type 1: System prompt
  if (matched.type === "system") {
    return {
      finalUserText: args || `Примени роль: ${matched.name}`,
      systemInjection: matched.systemContent,
    };
  }

  // Type 2: User prompt
  if (matched.type === "user") {
    const template = matched.userContent || "";
    const merged = args ? `${template}\n\nДополнительный контекст/задача: ${args}` : template;
    return {
      finalUserText: merged || args || matched.name,
    };
  }

  // Type 3: Composite prompt
  if (matched.type === "composite") {
    const template = matched.userContent || "";
    const merged = args ? `${template}\n\nДополнительный контекст/задача: ${args}` : template;
    return {
      finalUserText: merged || args || matched.name,
      systemInjection: matched.systemContent,
    };
  }

  // Type 4: Action prompt fallback
  return {
    finalUserText: args || matched.name,
  };
}

export function buildSkillsInstructions(projectDir?: string, userText = ""): string {
  const skills = listInstalledSkills(projectDir);
  const activeSkills = skills.filter((s) => s.isEnabled);

  if (activeSkills.length === 0) return "";

  const lowerUser = userText.toLowerCase();
  const summaryLines: string[] = [];
  const fullBodies: string[] = [];

  for (const s of activeSkills) {
    const triggers = s.triggers && s.triggers.length > 0 ? ` [Triggers: ${s.triggers.join(", ")}]` : "";
    summaryLines.push(`- **${s.name}** (\`${s.id}\`): ${s.description}${triggers}`);

    // If always_active or triggered by keywords in user prompt
    const isTriggered =
      s.always_active ||
      (s.triggers && s.triggers.some((t) => lowerUser.includes(t.toLowerCase())));

    if (isTriggered && s.body) {
      fullBodies.push(`\n## Active Skill: ${s.name}\n${s.body.trim()}`);
    }
  }

  let out = `\n\n# Available Skills Catalog\nYou have access to the following skills. Apply their specialized instructions when relevant:\n${summaryLines.join("\n")}`;

  if (fullBodies.length > 0) {
    out += `\n\n# Loaded Skill Directives\n${fullBodies.join("\n\n")}`;
  }

  return out;
}
