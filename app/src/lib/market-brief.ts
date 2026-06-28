import { saveWeeklyMoverAiBrief } from "@/lib/db";
import { generateGeminiBrief } from "@/lib/gemini";
import { generatePerplexityBrief } from "@/lib/perplexity";
import {
  buildMarketBriefPrompt,
  type MarketBriefMover,
} from "@/lib/stock-analysis-prompts";

export type AiAnalysisProvider = "perplexity" | "gemini";

export type MarketBriefResult = {
  text: string;
  model: string | null;
  provider: AiAnalysisProvider;
  aiBriefId: number | null;
};

export type GenerateMarketBriefOptions = {
  movers: MarketBriefMover[];
  lookbackDays: number;
  niftyUniverse: string;
  direction?: string;
  provider?: AiAnalysisProvider;
  weeklyMoverSnapshotId?: number | null;
};

export type MarketBriefSkipReason = "no_movers" | "ai_not_configured";

export type MarketBriefOutcome =
  | { status: "generated"; result: MarketBriefResult }
  | { status: "skipped"; reason: MarketBriefSkipReason };

export function resolveAiAnalysisProvider(
  preferred?: AiAnalysisProvider,
): AiAnalysisProvider | null {
  const hasPerplexity = Boolean(process.env.PERPLEXITY_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (preferred === "perplexity" && hasPerplexity) {
    return "perplexity";
  }
  if (preferred === "gemini" && hasGemini) {
    return "gemini";
  }
  if (hasPerplexity) {
    return "perplexity";
  }
  if (hasGemini) {
    return "gemini";
  }
  return null;
}

async function generateMarketBriefText(
  provider: AiAnalysisProvider,
  options: Omit<GenerateMarketBriefOptions, "provider" | "weeklyMoverSnapshotId">,
): Promise<{ text: string; model: string | null }> {
  const { system, user } = buildMarketBriefPrompt({
    movers: options.movers,
    lookbackDays: options.lookbackDays,
    niftyUniverse: options.niftyUniverse,
    direction: options.direction ?? "gainers",
  });

  if (provider === "gemini") {
    return generateGeminiBrief({ system, user, maxOutputTokens: 1800, temperature: 0.3 });
  }

  return generatePerplexityBrief({
    system,
    user,
    maxTokens: 1800,
    temperature: 0.3,
    searchRecencyFilter: "week",
  });
}

export async function generateMarketBrief(
  options: GenerateMarketBriefOptions,
): Promise<MarketBriefOutcome> {
  const movers = options.movers.filter((mover) => mover?.symbol);
  if (movers.length === 0) {
    return { status: "skipped", reason: "no_movers" };
  }

  const provider = resolveAiAnalysisProvider(options.provider);
  if (!provider) {
    return { status: "skipped", reason: "ai_not_configured" };
  }

  const { text, model } = await generateMarketBriefText(provider, {
    movers,
    lookbackDays: options.lookbackDays,
    niftyUniverse: options.niftyUniverse,
    direction: options.direction,
  });

  let aiBriefId: number | null = null;
  if (options.weeklyMoverSnapshotId) {
    aiBriefId = saveWeeklyMoverAiBrief({
      snapshotId: options.weeklyMoverSnapshotId,
      briefType: "market",
      symbol: null,
      provider,
      model,
      text,
    });
  }

  return {
    status: "generated",
    result: { text, model, provider, aiBriefId },
  };
}
