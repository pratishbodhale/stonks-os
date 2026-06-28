import Link from "next/link";
import { DailyScanRunButton } from "@/components/DailyScanRunButton";
import {
  DAILY_WEEKLY_MOVER_LOOKBACK_DAYS,
  DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT,
} from "@/lib/daily-scan";
import { DAILY_VOLUME_SPIKE_THRESHOLD, DAILY_SCAN_UNIVERSE } from "@/lib/daily-volume-scan";
import { listDailyScanRuns } from "@/lib/db";

export const metadata = {
  title: "Daily scan runs",
  description: "History of automated NIFTY 500 daily scans (volume analysis and weekly movers)",
};

export default function RunsDashboardPage() {
  const runs = listDailyScanRuns(60);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Automated scans
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Daily runs</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            NIFTY {DAILY_SCAN_UNIVERSE} jobs after market close. Each run includes volume analysis
            ({DAILY_VOLUME_SPIKE_THRESHOLD}×+ volume vs pre-move 20-session average), weekly
            movers ({DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT}%+ gain over{" "}
            {DAILY_WEEKLY_MOVER_LOOKBACK_DAYS} sessions), and an AI market brief when gainers exist.
          </p>
        </div>
        <DailyScanRunButton />
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          No daily runs recorded yet. Use <strong>Run daily scan</strong> above or trigger via{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">/api/daily-scan/run</code>.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{run.runDate}</p>
                  {(run.snapshotId || run.weeklyMoverSnapshotId) && (
                    <div className="mt-1.5 flex flex-col items-start gap-1">
                      {run.snapshotId ? (
                        <Link
                          href={`/runs/${run.snapshotId}`}
                          className="font-medium text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          Volume analysis →
                        </Link>
                      ) : null}
                      {run.weeklyMoverSnapshotId ? (
                        <Link
                          href={`/runs/weekly/${run.weeklyMoverSnapshotId}`}
                          className="font-medium text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          Movers analysis →
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
                <p className="shrink-0 text-xs text-zinc-500">
                  {new Date(run.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-100 pt-3 text-zinc-600">
                <div className="flex items-baseline gap-2">
                  <dt className="text-zinc-500">Volume spikes</dt>
                  <dd className="tabular-nums">
                    <span
                      className={
                        run.spikeCount > 0 ? "font-semibold text-violet-700" : "text-zinc-500"
                      }
                    >
                      {run.spikeCount}
                    </span>
                    {run.snapshotId ? (
                      <span className="ml-1.5 text-xs text-zinc-400">#{run.snapshotId}</span>
                    ) : null}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-zinc-500">Weekly gainers</dt>
                  <dd className="tabular-nums">
                    {run.weeklyMoverSnapshotId ? (
                      <>
                        <span
                          className={
                            run.weeklyGainerCount > 0
                              ? "font-semibold text-violet-700"
                              : "text-zinc-500"
                          }
                        >
                          {run.weeklyGainerCount}
                        </span>
                        <span className="ml-1.5 text-xs text-zinc-400">
                          #{run.weeklyMoverSnapshotId}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
