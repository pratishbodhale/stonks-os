import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { listFcmTokens, removeFcmTokens } from "@/lib/db";
import {
  getRunDetailsPath,
  getRunDetailsUrl,
  getWeeklyRunDetailsPath,
  getWeeklyRunDetailsUrl,
} from "@/lib/stock-links";

let firebaseApp: App | null = null;
let messagingClient: Messaging | null = null;

function loadServiceAccount(): Record<string, unknown> | null {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv) as Record<string, unknown>;
    } catch {
      console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
      return null;
    }
  }

  const credPath =
    process.env.FIREBASE_CREDENTIALS?.trim() ||
    path.join(process.cwd(), "firebase-credentials.json");
  if (!existsSync(credPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(credPath, "utf8")) as Record<string, unknown>;
  } catch {
    console.warn(`[FCM] Could not read Firebase credentials at ${credPath}.`);
    return null;
  }
}

export function initFirebaseAdmin(): Messaging | null {
  if (messagingClient) {
    return messagingClient;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn("[FCM] Firebase credentials missing. Notifications are disabled.");
    return null;
  }

  firebaseApp =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          credential: cert(serviceAccount),
        });
  messagingClient = getMessaging(firebaseApp);
  return messagingClient;
}

export type VolumeSpikeNotification = {
  title: string;
  body: string;
  spikeCount: number;
  snapshotId: number | null;
};

export type DailyScanNotification = {
  title: string;
  body: string;
  spikeCount: number;
  gainerCount: number;
  volumeSnapshotId: number | null;
  weeklyMoverSnapshotId: number | null;
  lookbackDays: number;
};

export function formatDailyScanNotification(input: {
  spikes: Array<{ symbol: string; volSpike: number }>;
  gainers: Array<{ symbol: string; periodChangePct: number }>;
  volumeSnapshotId: number | null;
  weeklyMoverSnapshotId: number | null;
  lookbackDays: number;
}): DailyScanNotification {
  const spikeCount = input.spikes.length;
  const gainerCount = input.gainers.length;

  if (spikeCount === 0 && gainerCount === 0) {
    return {
      title: "NIFTY 500 daily scan",
      body: `No volume spikes (5×+) or ${input.lookbackDays}d gainers (3%+) today.`,
      spikeCount: 0,
      gainerCount: 0,
      volumeSnapshotId: input.volumeSnapshotId,
      weeklyMoverSnapshotId: input.weeklyMoverSnapshotId,
      lookbackDays: input.lookbackDays,
    };
  }

  const parts: string[] = [];
  if (spikeCount > 0) {
    const topSpikes = input.spikes.slice(0, 4);
    const spikeSummary = topSpikes.map((row) => `${row.symbol} (${row.volSpike.toFixed(1)}x)`).join(", ");
    const spikeSuffix = spikeCount > topSpikes.length ? ` +${spikeCount - topSpikes.length} more` : "";
    parts.push(`Volume: ${spikeSummary}${spikeSuffix}`);
  }
  if (gainerCount > 0) {
    const topGainers = input.gainers.slice(0, 4);
    const gainerSummary = topGainers
      .map((row) => `${row.symbol} (${row.periodChangePct >= 0 ? "+" : ""}${row.periodChangePct.toFixed(1)}%)`)
      .join(", ");
    const gainerSuffix = gainerCount > topGainers.length ? ` +${gainerCount - topGainers.length} more` : "";
    parts.push(`${input.lookbackDays}d gainers: ${gainerSummary}${gainerSuffix}`);
  }

  const titleParts: string[] = [];
  if (spikeCount > 0) {
    titleParts.push(`${spikeCount} volume spike${spikeCount === 1 ? "" : "s"}`);
  }
  if (gainerCount > 0) {
    titleParts.push(`${gainerCount} weekly gainer${gainerCount === 1 ? "" : "s"}`);
  }

  return {
    title: `Daily scan · ${titleParts.join(", ")}`,
    body: parts.join(" · "),
    spikeCount,
    gainerCount,
    volumeSnapshotId: input.volumeSnapshotId,
    weeklyMoverSnapshotId: input.weeklyMoverSnapshotId,
    lookbackDays: input.lookbackDays,
  };
}

export async function sendDailyScanNotification(
  payload: DailyScanNotification,
): Promise<{ sent: boolean; successCount: number; failureCount: number; reason?: string }> {
  const client = initFirebaseAdmin();
  if (!client) {
    return { sent: false, successCount: 0, failureCount: 0, reason: "firebase_not_configured" };
  }

  const tokens = listFcmTokens();
  if (tokens.length === 0) {
    return { sent: false, successCount: 0, failureCount: 0, reason: "no_tokens" };
  }

  const url =
    payload.volumeSnapshotId !== null
      ? getRunDetailsPath(payload.volumeSnapshotId)
      : payload.weeklyMoverSnapshotId !== null
        ? getWeeklyRunDetailsPath(payload.weeklyMoverSnapshotId)
        : "/runs";

  const response = await client.sendEachForMulticast({
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      type: "daily_scan",
      spike_count: String(payload.spikeCount),
      gainer_count: String(payload.gainerCount),
      snapshot_id: payload.volumeSnapshotId ? String(payload.volumeSnapshotId) : "",
      weekly_snapshot_id: payload.weeklyMoverSnapshotId ? String(payload.weeklyMoverSnapshotId) : "",
      url,
    },
    webpush: {
      fcmOptions: {
        link:
          payload.volumeSnapshotId !== null
            ? getRunDetailsUrl(payload.volumeSnapshotId)
            : payload.weeklyMoverSnapshotId !== null
              ? getWeeklyRunDetailsUrl(payload.weeklyMoverSnapshotId)
              : undefined,
      },
    },
    tokens,
  });

  const invalidTokens: string[] = [];
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code ?? "";
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        invalidTokens.push(tokens[index]!);
      }
    }
  });
  if (invalidTokens.length > 0) {
    removeFcmTokens(invalidTokens);
  }

  return {
    sent: response.successCount > 0,
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

export function formatVolumeSpikeNotification(
  spikes: Array<{ symbol: string; volSpike: number }>,
  snapshotId: number | null,
): VolumeSpikeNotification {
  if (spikes.length === 0) {
    return {
      title: "NIFTY 500 daily volume scan",
      body: "No stocks with 5×+ volume today.",
      spikeCount: 0,
      snapshotId,
    };
  }

  const top = spikes.slice(0, 8);
  const summary = top.map((row) => `${row.symbol} (${row.volSpike.toFixed(1)}x)`).join(", ");
  const suffix = spikes.length > top.length ? ` +${spikes.length - top.length} more` : "";

  return {
    title: `${spikes.length} NIFTY 500 volume spike${spikes.length === 1 ? "" : "s"} (5×+)`,
    body: `${summary}${suffix}`,
    spikeCount: spikes.length,
    snapshotId,
  };
}

export async function sendVolumeSpikeNotification(
  payload: VolumeSpikeNotification,
): Promise<{ sent: boolean; successCount: number; failureCount: number; reason?: string }> {
  const client = initFirebaseAdmin();
  if (!client) {
    return { sent: false, successCount: 0, failureCount: 0, reason: "firebase_not_configured" };
  }

  const tokens = listFcmTokens();
  if (tokens.length === 0) {
    return { sent: false, successCount: 0, failureCount: 0, reason: "no_tokens" };
  }

  const response = await client.sendEachForMulticast({
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      type: "daily_volume_scan",
      spike_count: String(payload.spikeCount),
      snapshot_id: payload.snapshotId ? String(payload.snapshotId) : "",
      url: payload.snapshotId ? getRunDetailsPath(payload.snapshotId) : "/",
    },
    webpush: payload.snapshotId
      ? {
          fcmOptions: {
            link: getRunDetailsUrl(payload.snapshotId),
          },
        }
      : undefined,
    tokens,
  });

  const invalidTokens: string[] = [];
  response.responses.forEach((item, index) => {
    if (!item.success) {
      const code = item.error?.code ?? "";
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") {
        invalidTokens.push(tokens[index]!);
      }
    }
  });
  if (invalidTokens.length > 0) {
    removeFcmTokens(invalidTokens);
  }

  return {
    sent: response.successCount > 0,
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}
