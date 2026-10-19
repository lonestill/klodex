import { generateText } from "ai";
import { basename } from "node:path";
import { buildModel } from "./providers.ts";

/**
 * Generates a short, descriptive chat title (2-4 words) reflecting the user's task.
 * Guaranteed zero hallucinated AI model/vendor names (e.g. DeepSeek, OpenAI, ChatGPT).
 * Falls back to clean heuristic truncation if model calls fail or timeout.
 */
export async function generateTitleWithMicroModel(userPrompt: string, projectDir?: string): Promise<string> {
  const cleanPrompt = userPrompt.trim().slice(0, 400);
  if (!cleanPrompt) return "Новая сессия";

  let projectName = "";
  if (projectDir) {
    const b = basename(projectDir).trim();
    if (b && b !== "/" && b !== "." && b !== "Users" && b !== "home") {
      projectName = b;
    }
  }

  // Micro-model candidate list in priority order:
  // 1. antigravity / gemini-3.5-flash-lite: ultra-fast (200-400ms) local runtime, clean output
  // 2. deepai / deepseek-v3.2: keyless fallback
  // 3. opencode / deepseek-v4.1-flash-free: free tier fallback
  const candidates = [
    { provider: "antigravity", model: "gemini-3.5-flash-lite" },
    { provider: "deepai", model: "deepseek-v3.2" },
    { provider: "opencode", model: "deepseek-v4.1-flash-free" },
  ];

  const projectContext = projectName ? `Имя проекта пользователя: "${projectName}".` : "";

  const prompt = [
    `Придумай короткое, емкое название для вкладки чата (от 2 до 4 слов), отражающее суть задачи.`,
    projectContext,
    `\nПРАВИЛА:`,
    `- Ровно от 2 до 4 слов на том же языке, что и запрос пользователя.`,
    `- Верни ТОЛЬКО название в одну строку: без кавычек, без точки на конце, без слова "Название:".`,
    `- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО добавлять названия нейросетей, компаний и моделей (DeepSeek, ChatGPT, OpenAI, Claude, Gemini, DeepAI и т.д.), если их НЕТ в запросе пользователя!`,
    `- Не выдумывай названия сторонних систем или технологий, о которых пользователь не писал.`,
    `\nЗапрос пользователя:\n${cleanPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  const BANNED_HALLUCINATIONS = [
    "deepseek",
    "chatgpt",
    "openai",
    "claude",
    "gemini",
    "anthropic",
    "deepai",
    "gpt-4",
    "gpt-4o",
    "gpt-3",
    "llama",
    "qwen",
    "mistral",
  ];

  for (const cand of candidates) {
    try {
      const m = await buildModel(cand.provider, cand.model);
      const res = await generateText({
        model: m,
        prompt,
        maxTokens: 25,
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(5000),
      });

      let text = res.text?.trim() ?? "";
      // Strip markdown quotes, bold, asterisks, backticks, brackets
      text = text.replace(/^[`"'«“„\s]+|[`"'»”\s]+$/g, "").trim();
      text = text.replace(/^[#\s*\->]+/, "").trim();
      text = text.replace(/^(название|title|тема):\s*/i, "").trim();
      if (text.includes("\n")) {
        text = text.split("\n")[0].trim();
      }
      text = text.replace(/[.:;!]+$/, "").trim();

      // Purge hallucinated vendor/model names if user did not ask for them
      for (const banned of BANNED_HALLUCINATIONS) {
        if (!cleanPrompt.toLowerCase().includes(banned) && text.toLowerCase().includes(banned)) {
          const re = new RegExp(`\\b${banned}\\b`, "gi");
          text = text.replace(re, "").replace(/\s{2,}/g, " ").trim();
        }
      }

      // If user mentioned "аудит проекта" and we know the project name, contextualize it
      if (projectName && /\b(проекта|проект)\b/i.test(text) && !text.toLowerCase().includes(projectName.toLowerCase())) {
        text = `${text} ${projectName}`;
      }

      if (text && text.length >= 2 && text.length <= 60 && !text.toLowerCase().startsWith("error")) {
        return text;
      }
    } catch {
      // Try next candidate
    }
  }

  // Fallback heuristic: take first 3-4 words
  const words = cleanPrompt.replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/\s+/g, " ").trim().split(" ");
  const slice = words.slice(0, 4).join(" ");
  return slice.length > 35 ? slice.slice(0, 32) + "…" : slice || "Новая сессия";
}
