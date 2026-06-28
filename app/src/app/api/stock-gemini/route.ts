import { NextResponse } from "next/server";
import { saveWeeklyMoverAiBrief } from "@/lib/db";
import { generateGeminiBrief } from "@/lib/gemini";
import { buildStockBriefPrompt } from "@/lib/stock-analysis-prompts";

function parseWeeklyMoverSnapshotId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  let body: {
    symbol?: string;
    name?: string | null;
    strategy?: string;
    periodChangePct?: number;
    lookbackDays?: number;
    weeklyMoverSnapshotId?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol = body.symbol?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const { system, user } = buildStockBriefPrompt({
    symbol,
    name: body.name,
    isWeeklyMover: body.strategy === "weekly-mover",
    periodChangePct: body.periodChangePct,
    lookbackDays: body.lookbackDays,
  });

  try {
    const { text, model } = await generateGeminiBrief({ system, user });

    const weeklyMoverSnapshotId = parseWeeklyMoverSnapshotId(body.weeklyMoverSnapshotId);
    let aiBriefId: number | null = null;
    if (weeklyMoverSnapshotId && body.strategy === "weekly-mover") {
      aiBriefId = saveWeeklyMoverAiBrief({
        snapshotId: weeklyMoverSnapshotId,
        briefType: "stock",
        symbol,
        provider: "gemini",
        model,
        text,
      });
    }

    return NextResponse.json({ text, model, provider: "gemini", aiBriefId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed";
    const detail = error instanceof Error && "detail" in error ? String(error.detail) : undefined;
    const status = message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message, detail }, { status });
  }
}
