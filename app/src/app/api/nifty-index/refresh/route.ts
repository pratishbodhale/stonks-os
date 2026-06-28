import { NextResponse } from "next/server";
import {
  getLastIndexRefreshInfo,
  parseNiftyUniverse,
} from "@/lib/nifty-constituents";
import { refreshNiftyIndexFromNseAndPersist } from "@/lib/nifty-index-server";

export const dynamic = "force-dynamic";

/**
 * Pulls the latest NSE index constituent list for the given universe and stores it in memory
 * (process-wide). Does not run a Yahoo scan. Use the scan API to run a stock scan and save to DB.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const universe = parseNiftyUniverse(searchParams.get("niftyUniverse") ?? searchParams.get("nifty"));

  const result = await refreshNiftyIndexFromNseAndPersist(universe);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, niftyUniverse: universe }, { status: 502 });
  }

  const info = getLastIndexRefreshInfo(universe);
  return NextResponse.json({
    ok: true,
    niftyUniverse: universe,
    symbolsPulled: result.count,
    fetchedAt: info?.at ?? new Date().toISOString(),
  });
}
