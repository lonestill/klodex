import { generateText } from "ai";
import { buildModel } from "./providers.ts";

/**
 * Generates a short, descriptive chat title (2-5 words) using a fast/micro model.
 * Falls back to heuristic truncation if model calls fail or timeout.
 */
export async function generateTitleWithMicroModel(userPrompt: string): Promise<string> {
  const cleanPrompt = userPrompt.trim().slice(0, 400);
  if (!cleanPrompt) return "Новая сессия";

  // Micro-model candidate list in priority order:
  // 1. deepai / deepseek-v3.2: 100% keyless, reverse API, ~1.5s latency, 0 cost
  // 2. antigravity / gemini-3.5-flash-lite: fast local runtime if available
  // 3. opencode / deepseek-v4.1-flash-free: free tier fallback
  const candidates = [
    { provider: "deepai", model: "deepseek-v3.2" },
    { provider: "antigravity", model: "gemini-3.5-flash-lite" },
    { provider: "opencode", model: "deepseek-v4.1-flash-free" },
  ];

  for (const cand of candidates) {
    try {
      const m = await buildModel(cand.provider, cand.model);
      const res = await generateText({
        model: m,
        prompt: `Придумай короткое, емкое название для чата (от 2 до 5 слов), отражающее суть задачи. Верни ТОЛЬКО название в одну строку без кавычек, префиксов и знаков препинания на конце. Пиши на том же языке, на котором написан запрос.\n\nЗапрос:\n${cleanPrompt}`,
        maxTokens: 25,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(6000),
      });

      let text = res.text?.trim() ?? "";
      // Strip markdown quotes, bold, asterisks, backticks, brackets
      text = text.replace(/^[`"'«]+|[`"'»]+$/g, "").trim();
      text = text.replace(/^[#\s*\->]+/, "").trim();
      if (text.includes("\n")) {
        text = text.split("\n")[0].trim();
      }
      text = text.replace(/[.:;!]+$/, "").trim();

      if (text && text.length >= 2 && text.length <= 60 && !text.toLowerCase().startsWith("error")) {
        return text;
      }
    } catch {
      // Try next candidate
    }
  }

  // Fallback heuristic: take first 4-5 words
  const words = cleanPrompt.replace(/\s+/g, " ").trim().split(" ");
  const slice = words.slice(0, 5).join(" ");
  return slice.length > 35 ? slice.slice(0, 32) + "…" : slice || "Новая сессия";
}
