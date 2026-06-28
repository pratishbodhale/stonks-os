import { NextResponse } from "next/server";
import { getNseIndexStatusWithCache } from "@/lib/nifty-index-server";

export const dynamic = "force-dynamic";

/**
 * Returns which Nifty universes have a live NSE list loaded in this server process (if any),
 * so the client can show “last pull” even after a full page reload.
 */
export async function GET() {
  return NextResponse.json({ universes: getNseIndexStatusWithCache() });
}
