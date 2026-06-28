import { NextResponse } from "next/server";
import {
  aggregateCashtagCounts,
  countsToSortedRankings,
} from "@/lib/cashtags";

const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

/** Default multireddit: US + India equity discussion. */
const DEFAULT_SUBREDDITS =
  "stocks+investing+StockMarket+wallstreetbets+IndianStockMarket+IndiaInvestments";

type RedditTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type RedditPostData = {
  title?: string;
  selftext?: string;
  subreddit?: string;
};

type RedditListingResponse = {
  data?: {
    children?: Array<{ kind?: string; data?: RedditPostData }>;
    after?: string | null;
  };
};

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function getUserAgent(): string {
  const custom = process.env.REDDIT_USER_AGENT?.trim();
  if (custom) {
    return custom;
  }
  return "web:stocks-dashboard:v1.0 (server; https://github.com/)";
}

async function getRedditAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const response = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": getUserAgent(),
    },
    body: "grant_type=client_credentials",
    next: { revalidate: 0 },
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit OAuth ${response.status}: ${raw.slice(0, 400)}`);
  }

  let data: RedditTokenResponse;
  try {
    data = JSON.parse(raw) as RedditTokenResponse;
  } catch {
    throw new Error(`Invalid JSON from Reddit OAuth: ${raw.slice(0, 200)}`);
  }

  const token = data.access_token;
  if (!token) {
    throw new Error("Reddit OAuth returned no access_token");
  }

  const ttlSec = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cachedToken = {
    token,
    expiresAtMs: now + ttlSec * 1000,
  };
  return token;
}

async function fetchListingTexts(
  bearer: string,
  pathSuffix: string,
  targetTotal: number,
  maxPages: number,
): Promise<{ texts: string[]; pages: number; truncated: boolean }> {
  const texts: string[] = [];
  let pages = 0;
  let after: string | undefined;
  let truncated = false;

  while (texts.length < targetTotal && pages < maxPages) {
    const params = new URLSearchParams({
      limit: "100",
      raw_json: "1",
    });
    if (after) {
      params.set("after", after);
    }

    const url = `https://oauth.reddit.com/r/${pathSuffix}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "User-Agent": getUserAgent(),
      },
      next: { revalidate: 0 },
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Reddit API ${response.status}: ${raw.slice(0, 400)}`);
    }

    let listing: RedditListingResponse;
    try {
      listing = JSON.parse(raw) as RedditListingResponse;
    } catch {
      throw new Error(`Invalid JSON from Reddit: ${raw.slice(0, 200)}`);
    }

    const children = listing.data?.children ?? [];
    for (const child of children) {
      const d = child.data;
      if (!d) {
        continue;
      }
      const title = (d.title ?? "").trim();
      const body = (d.selftext ?? "").trim();
      const combined = `${title}\n${body}`.trim();
      if (combined) {
        texts.push(combined);
      }
    }

    pages += 1;
    const nextAfter = listing.data?.after;
    if (!nextAfter || children.length === 0) {
      break;
    }
    after = nextAfter;
    if (texts.length >= targetTotal) {
      truncated = Boolean(nextAfter);
      break;
    }
  }

  return { texts, pages, truncated };
}

export async function GET(request: Request) {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Reddit is not configured. Create an app at reddit.com/prefs/apps (type “script” or “web app”), then set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in `.env.local`. Optionally set REDDIT_USER_AGENT (must be unique and descriptive per Reddit rules).",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitParam)
    ? Math.min(100, Math.max(5, Math.floor(limitParam)))
    : 40;

  const postsParam = Number(url.searchParams.get("posts") ?? "400");
  const targetTotal = Number.isFinite(postsParam)
    ? Math.min(1200, Math.max(50, Math.floor(postsParam)))
    : 400;

  const subOverride = url.searchParams.get("subreddits")?.trim();
  const multireddit =
    subOverride && subOverride.length >= 3 ? subOverride : DEFAULT_SUBREDDITS;

  const sort = url.searchParams.get("sort")?.trim().toLowerCase();
  const sortPath = sort === "new" ? "new" : "hot";

  try {
    const bearer = await getRedditAccessToken(clientId, clientSecret);
    const pathSuffix = `${multireddit}/${sortPath}`;
    const maxPages = Math.ceil(targetTotal / 100) + 3;
    const { texts, pages, truncated } = await fetchListingTexts(
      bearer,
      pathSuffix,
      targetTotal,
      maxPages,
    );

    const counts = aggregateCashtagCounts(texts);
    const rankings = countsToSortedRankings(counts, limit);

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      postsSampled: texts.length,
      pagesFetched: pages,
      truncatedSample: truncated,
      subredditsUsed: multireddit,
      sort: sortPath,
      rankings,
      note:
        "Cashtag counts from Reddit post titles and self-text in the sampled listings. Application-only OAuth; respect Reddit rate limits and terms of use.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reddit request failed";
    return NextResponse.json(
      {
        error: message,
        hint:
          "Ensure the Reddit app is “confidential” (has a secret) so client_credentials works. Check REDDIT_USER_AGENT is set to something unique.",
      },
      { status: 502 },
    );
  }
}
