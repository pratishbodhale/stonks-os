import { NextResponse } from "next/server";
import { generateMarketBrief, type AiAnalysisProvider } from "@/lib/market-brief";
import type { MarketBriefMover } from "@/lib/stock-analysis-prompts";

function parseWeeklyMoverSnapshotId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  let body: {
    movers?: MarketBriefMover[];
    lookbackDays?: number;
    niftyUniverse?: string;
    direction?: string;
    provider?: string;
    weeklyMoverSnapshotId?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const movers = Array.isArray(body.movers) ? body.movers.filter((m) => m?.symbol) : [];
  if (movers.length === 0) {
    return NextResponse.json({ error: "movers array is required" }, { status: 400 });
  }

  const provider: AiAnalysisProvider | undefined =
    body.provider === "gemini" ? "gemini" : body.provider === "perplexity" ? "perplexity" : undefined;
  const weeklyMoverSnapshotId = parseWeeklyMoverSnapshotId(body.weeklyMoverSnapshotId);

  try {
    const outcome = await generateMarketBrief({
      movers,
      lookbackDays: body.lookbackDays ?? 5,
      niftyUniverse: body.niftyUniverse ?? "200",
      direction: body.direction ?? "gainers",
      provider,
      weeklyMoverSnapshotId,
    });

    if (outcome.status === "skipped") {
      if (outcome.reason === "ai_not_configured") {
        return NextResponse.json(
          {
            error:
              "AI analysis is not configured. Add PERPLEXITY_API_KEY or GEMINI_API_KEY to your environment.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "movers array is required" }, { status: 400 });
    }

    const { text, model, provider: usedProvider, aiBriefId } = outcome.result;
    return NextResponse.json({ text, model, provider: usedProvider, aiBriefId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis request failed";
    const detail = error instanceof Error && "detail" in error ? String(error.detail) : undefined;
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message, detail }, { status });
  }
}
