import { formatUpstreamAiError } from "@/lib/ai-error";
import { stripThinkingTags } from "@/lib/strip-thinking-tags";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

type GeminiPart = { text?: string; thought?: boolean };
type GeminiGroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiGroundingSupport = {
  segment?: { startIndex?: number; endIndex?: number };
  groundingChunkIndices?: number[];
};
type GeminiCompletion = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[];
      groundingSupports?: GeminiGroundingSupport[];
    };
  }>;
};

export type GeminiBriefOptions = {
  system: string;
  user: string;
  maxOutputTokens?: number;
  temperature?: number;
};

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

function addInlineCitations(text: string, candidate: GeminiCompletion["candidates"]): string {
  const supports = candidate?.[0]?.groundingMetadata?.groundingSupports;
  const chunks = candidate?.[0]?.groundingMetadata?.groundingChunks;
  if (!supports?.length || !chunks?.length) {
    return text;
  }

  let out = text;
  const sortedSupports = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
  );

  for (const support of sortedSupports) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) {
      continue;
    }

    const citationLinks = support.groundingChunkIndices
      .map((i) => {
        const chunk = chunks[i];
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title ?? `Source ${i + 1}`;
        return uri ? `[${title}](${uri})` : null;
      })
      .filter(Boolean);

    if (citationLinks.length > 0) {
      out = `${out.slice(0, endIndex)} ${citationLinks.join(", ")}${out.slice(endIndex)}`;
    }
  }

  return out;
}

function extractVisibleGeminiText(parts: GeminiPart[] | undefined): string {
  if (!parts?.length) {
    return "";
  }
  return parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export async function generateGeminiBrief(
  options: GeminiBriefOptions,
): Promise<{ text: string; model: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini is not configured. Add GEMINI_API_KEY to your environment (e.g. `.env.local`).",
    );
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: options.system }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.user }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: options.temperature ?? 0.25,
        maxOutputTokens: options.maxOutputTokens ?? 4096,
        // Briefs are summarization, not deep reasoning — thinking tokens share the
        // maxOutputTokens budget and can truncate the visible answer mid-sentence.
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  const rawText = await upstream.text();
  if (!upstream.ok) {
    const { message, httpStatus } = formatUpstreamAiError("Gemini", upstream.status, rawText);
    const err = new Error(message) as Error & { httpStatus?: number };
    err.httpStatus = httpStatus;
    throw err;
  }

  let data: GeminiCompletion;
  try {
    data = JSON.parse(rawText) as GeminiCompletion;
  } catch {
    const err = new Error("Invalid JSON from Gemini") as Error & { detail?: string };
    err.detail = rawText.slice(0, 400);
    throw err;
  }

  const candidate = data.candidates?.[0];
  let raw = extractVisibleGeminiText(candidate?.content?.parts);
  if (!raw) {
    throw new Error("Empty response from Gemini");
  }

  if (candidate?.finishReason === "MAX_TOKENS") {
    raw = `${raw}\n\n---\n*Summary was cut off at the token limit. Regenerate for a complete brief.*`;
  }

  const withCitations = addInlineCitations(raw, data.candidates);
  return { text: stripThinkingTags(withCitations), model };
}
