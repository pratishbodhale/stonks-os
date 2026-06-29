import { formatUpstreamAiError } from "@/lib/ai-error";
import { stripThinkingTags } from "@/lib/strip-thinking-tags";

const PERPLEXITY_CHAT_URL = "https://api.perplexity.ai/v1/sonar";
const DEFAULT_MODEL = "sonar-reasoning-pro";

type PerplexityCompletion = {
  choices?: Array<{ message?: { content?: string } }>;
};

export type PerplexityBriefOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  searchRecencyFilter?: "week" | "month";
};

export function getPerplexityApiKey(): string | undefined {
  return process.env.PERPLEXITY_API_KEY?.trim() || undefined;
}

export async function generatePerplexityBrief(
  options: PerplexityBriefOptions,
): Promise<{ text: string; model: string }> {
  const apiKey = getPerplexityApiKey();
  if (!apiKey) {
    throw new Error(
      "Perplexity is not configured. Add PERPLEXITY_API_KEY to your environment (e.g. `.env.local`).",
    );
  }

  const model = process.env.PERPLEXITY_MODEL?.trim() || DEFAULT_MODEL;

  const upstream = await fetch(PERPLEXITY_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      max_tokens: options.maxTokens ?? 1400,
      temperature: options.temperature ?? 0.25,
      search_recency_filter: options.searchRecencyFilter ?? "month",
    }),
  });

  const rawText = await upstream.text();
  if (!upstream.ok) {
    const { message, httpStatus } = formatUpstreamAiError("Perplexity", upstream.status, rawText);
    const err = new Error(message) as Error & { httpStatus?: number };
    err.httpStatus = httpStatus;
    throw err;
  }

  let data: PerplexityCompletion;
  try {
    data = JSON.parse(rawText) as PerplexityCompletion;
  } catch {
    const err = new Error("Invalid JSON from Perplexity") as Error & { detail?: string };
    err.detail = rawText.slice(0, 400);
    throw err;
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("Empty response from Perplexity");
  }

  return { text: stripThinkingTags(raw), model };
}
