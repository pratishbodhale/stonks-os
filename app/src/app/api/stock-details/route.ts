import { NextResponse } from "next/server";
import { fetchStockDeepDive } from "@/lib/stock-deep-dive";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const details = await fetchStockDeepDive(symbol);
  return NextResponse.json(details);
}
