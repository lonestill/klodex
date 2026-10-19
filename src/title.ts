import { generateText } from "ai";
import { basename } from "node:path";
import { buildModel } from "./providers.ts";

export type TitleModelKey = {
  provider: string;
  model: string;
};

/**
 * Generates a short, descriptive chat title (2-4 words) using strictly
 * the model selected by the user for the current chat session.
 * Zero hardcoded fallback models. If the call fails, cleanly truncates the user prompt.
 */
export async function generateTitleWithModel(
  userPrompt: string,
  modelKey: TitleModelKey,
  projectDir?: string,
): Promise<string> {
  const cleanPrompt = userPrompt.trim().slice(0, 400);
  if (!cleanPrompt) return "Новая сессия";

  let projectName = "";
  if (projectDir) {
    const b = basename(projectDir).trim();
    if (b && b !== "/" && b !== "." && b !== "Users" && b !== "home") {
      projectName = b;
    }
  }

  const projectContext = projectName ? `Имя проекта: "${projectName}".` : "";

  const prompt = [
    `Придумай короткое название (2-4 слова) для вкладки чата по сути задачи.`,
    projectContext,
    `ПРАВИЛА:`,
    `- Ровно 2-4 слова на языке запроса.`,
    `- Верни ТОЛЬКО название в одну строку без кавычек, без точки на конце.`,
    `- Не выдумывай названия технологий и систем, которых нет в запросе.`,
    `\nЗапрос:\n${cleanPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const m = await buildModel(modelKey.provider, modelKey.model);
    const res = await generateText({
      model: m,
      prompt,
      maxTokens: 25,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(10000),
    });

    let text = res.text?.trim() ?? "";
    text = text.replace(/^[`"'«“„\s]+|[`"'»”\s]+$/g, "").trim();
    text = text.replace(/^[#\s*\->]+/, "").trim();
    text = text.replace(/^(название|title|тема):\s*/i, "").trim();
    if (text.includes("\n")) {
      text = text.split("\n")[0].trim();
    }
    text = text.replace(/[.:;!]+$/, "").trim();

    if (text && text.length >= 2 && text.length <= 60 && !text.toLowerCase().startsWith("error")) {
      return text;
    }
  } catch (err: any) {
    console.warn(`[title] Generation with ${modelKey.provider}/${modelKey.model} failed, using heuristic:`, err?.message || err);
  }

  // Fallback: first 3-4 words of the user prompt without pinging any other models
  const words = cleanPrompt.replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/\s+/g, " ").trim().split(" ");
  const slice = words.slice(0, 4).join(" ");
  return slice.length > 35 ? slice.slice(0, 32) + "…" : slice || "Новая сессия";
}
