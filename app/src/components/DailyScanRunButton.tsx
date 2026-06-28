"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type RunStatus = "idle" | "running" | "success" | "skipped" | "error";

type DailyScanAiBriefResponse =
  | {
      status: "generated";
      aiBriefId: number | null;
      provider: "perplexity" | "gemini";
      model: string | null;
    }
  | {
      status: "skipped";
      reason: "no_gainers" | "no_movers" | "ai_not_configured";
    };

type DailyScanRunResponse = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  runDate?: string;
  symbolsScanned?: number;
  spikeCount?: number;
  gainerCount?: number;
  volumeSnapshotId?: number;
  weeklyMoverSnapshotId?: number;
  aiBrief?: DailyScanAiBriefResponse | null;
};

function formatAiBriefMessage(aiBrief: DailyScanAiBriefResponse | null | undefined): string | null {
  if (!aiBrief) {
    return null;
  }
  if (aiBrief.status === "generated") {
    const provider = aiBrief.provider === "gemini" ? "Gemini" : "Perplexity";
    return aiBrief.aiBriefId
      ? `AI market brief saved (${provider} · #${aiBrief.aiBriefId})`
      : `AI market brief generated (${provider})`;
  }
  if (aiBrief.reason === "ai_not_configured") {
    return "AI analysis skipped — no API key configured.";
  }
  if (aiBrief.reason === "no_gainers") {
    return "AI analysis skipped — no weekly gainers.";
  }
  return null;
}

function formatSkipReason(reason: string | undefined): string {
  switch (reason) {
    case "not_trading_day":
      return "Skipped — not an NSE trading day.";
    case "before_market_close":
      return "Skipped — market has not closed yet (15:30 IST).";
    case "already_ran_today":
      return "Already ran today. Use force to run again.";
    default:
      return "Scan skipped.";
  }
}

type DailyScanRunButtonProps = {
  variant?: "primary" | "secondary";
  className?: string;
  onComplete?: () => void;
};

export function DailyScanRunButton({
  variant = "primary",
  className = "",
  onComplete,
}: DailyScanRunButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RunStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DailyScanRunResponse | null>(null);

  const runScan = useCallback(async () => {
    setStatus("running");
    setMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/daily-scan/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          skipMarketCheck: true,
          sendNotification: false,
        }),
      });
      const data = (await response.json()) as DailyScanRunResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Daily scan failed");
      }

      if (data.skipped) {
        setStatus("skipped");
        setMessage(formatSkipReason(data.reason));
        setResult(data);
        return;
      }

      setStatus("success");
      setResult(data);
      const aiMessage = formatAiBriefMessage(data.aiBrief);
      setMessage(
        [
          `Scanned ${data.symbolsScanned ?? 0} symbols · ${data.spikeCount ?? 0} volume spikes · ${data.gainerCount ?? 0} weekly gainers`,
          aiMessage,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.refresh();
      onComplete?.();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Daily scan failed");
    }
  }, [onComplete, router]);

  const buttonClass =
    variant === "primary"
      ? "rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
      : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void runScan()}
        disabled={status === "running"}
        className={buttonClass}
      >
        {status === "running" ? "Running daily scan…" : "Run daily scan"}
      </button>
      {status === "running" ? (
        <p className="max-w-xs text-right text-[11px] text-zinc-500">
          NIFTY 500 volume + weekly movers + AI market brief — may take a few minutes.
        </p>
      ) : null}
      {message ? (
        <p
          className={`max-w-xs text-right text-[11px] ${
            status === "error" ? "text-red-600" : status === "success" ? "text-emerald-700" : "text-zinc-500"
          }`}
        >
          {message}
        </p>
      ) : null}
      {status === "success" && result?.volumeSnapshotId ? (
        <div className="flex flex-wrap justify-end gap-2 text-[11px]">
          <Link href={`/runs/${result.volumeSnapshotId}`} className="font-medium text-violet-700 hover:underline">
            Volume analysis →
          </Link>
          {result.weeklyMoverSnapshotId ? (
            <Link
              href={`/runs/weekly/${result.weeklyMoverSnapshotId}`}
              className="font-medium text-violet-700 hover:underline"
            >
              Movers analysis →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
