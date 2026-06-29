import { NextResponse } from "next/server";
import { executeDailyScanJob } from "@/lib/daily-scan";
import type { AiAnalysisProvider } from "@/lib/market-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

export async function POST(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // No JSON body — query params only.
  }

  const force = parseBoolean(
    typeof body.force === "boolean" ? String(body.force) : searchParams.get("force"),
    true,
  );
  const skipMarketCheck = parseBoolean(
    typeof body.skipMarketCheck === "boolean"
      ? String(body.skipMarketCheck)
      : searchParams.get("skipMarketCheck"),
    true,
  );
  const sendNotification = parseBoolean(
    typeof body.sendNotification === "boolean"
      ? String(body.sendNotification)
      : searchParams.get("sendNotification"),
    true,
  );
  const includeAiAnalysis = parseBoolean(
    typeof body.includeAiAnalysis === "boolean"
      ? String(body.includeAiAnalysis)
      : searchParams.get("includeAiAnalysis"),
    true,
  );
  const aiProvider: AiAnalysisProvider | undefined =
    body.aiProvider === "perplexity" || searchParams.get("aiProvider") === "perplexity"
      ? "perplexity"
      : body.aiProvider === "gemini" || searchParams.get("aiProvider") === "gemini"
        ? "gemini"
        : "gemini";

  try {
    const result = await executeDailyScanJob({
      force,
      skipMarketCheck,
      sendNotification,
      includeAiAnalysis,
      aiProvider,
    });
    if (result.status === "skipped") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: result.reason,
        runDate: result.runDate,
      });
    }

    return NextResponse.json({
      ok: true,
      ...result.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
