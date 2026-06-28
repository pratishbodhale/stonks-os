import { NextResponse } from "next/server";
import { executeDailyScanJob } from "@/lib/daily-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function parseBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }
  return value === "true";
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const force = parseBoolean(searchParams.get("force"), false);
  const skipMarketCheck = parseBoolean(searchParams.get("skipMarketCheck"), false);

  try {
    const result = await executeDailyScanJob({
      force,
      skipMarketCheck,
      sendNotification: true,
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
