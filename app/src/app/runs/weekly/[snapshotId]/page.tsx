import Link from "next/link";
import { notFound } from "next/navigation";
import { RunWeeklyMoversTable } from "@/components/RunWeeklyMoversTable";
import { PerplexityMarkdown } from "@/components/PerplexityMarkdown";
import {
  DAILY_WEEKLY_MOVER_LOOKBACK_DAYS,
  DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT,
  filterDailyWeeklyGainers,
} from "@/lib/daily-scan";
import { DAILY_SCAN_UNIVERSE } from "@/lib/daily-volume-scan";
import {
  getLatestWeeklyMoverAiBrief,
  getWeeklyMoverSnapshotMeta,
  getWeeklyMoverSnapshotRows,
} from "@/lib/db";

type WeeklyRunPageProps = {
  params: Promise<{ snapshotId: string }>;
};

export async function generateMetadata({ params }: WeeklyRunPageProps) {
  const { snapshotId } = await params;
  return {
    title: `Weekly movers scan #${snapshotId}`,
    description: `NIFTY 500 stocks with ${DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT}%+ gain over ${DAILY_WEEKLY_MOVER_LOOKBACK_DAYS} sessions for scan run #${snapshotId}`,
  };
}

export default async function WeeklyRunPage({ params }: WeeklyRunPageProps) {
  const { snapshotId: idStr } = await params;
  const snapshotId = Number(idStr);
  if (!Number.isFinite(snapshotId) || snapshotId < 1) {
    notFound();
  }

  const meta = getWeeklyMoverSnapshotMeta(snapshotId);
  if (!meta) {
    notFound();
  }

  const gainers = filterDailyWeeklyGainers(getWeeklyMoverSnapshotRows(snapshotId));
  const marketBrief = getLatestWeeklyMoverAiBrief(snapshotId, "market");

  const scannedAt = new Date(meta.createdAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Weekly movers scan
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Run #{snapshotId}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            NIFTY {meta.niftyUniverse || DAILY_SCAN_UNIVERSE} stocks that gained at least{" "}
            {DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT}% over the last {meta.lookbackDays} sessions, as
            captured when this daily job ran.
          </p>
        </div>
        <Link
          href="/runs"
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          All runs
        </Link>
      </div>

      <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Scanned at (IST)" value={scannedAt} />
        <Stat label="Universe" value={`NIFTY ${meta.niftyUniverse || DAILY_SCAN_UNIVERSE}`} />
        <Stat label="Symbols scanned" value={String(meta.symbolsScanned)} />
        <Stat
          label="Weekly gainers"
          value={`${gainers.length} at ${DAILY_WEEKLY_MOVER_MIN_ABS_CHANGE_PCT}%+ / ${meta.lookbackDays}d`}
          highlight={gainers.length > 0}
        />
      </section>

      {marketBrief ? (
        <section className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm ring-1 ring-violet-50">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
              AI market brief
            </h2>
            <p className="text-[11px] text-zinc-500">
              {marketBrief.provider === "gemini" ? "Gemini" : "Perplexity"}
              {marketBrief.model ? ` · ${marketBrief.model}` : ""}
              {marketBrief.id ? ` · #${marketBrief.id}` : ""}
            </p>
          </div>
          <PerplexityMarkdown markdown={marketBrief.text} className="text-sm" />
        </section>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">
          {gainers.length > 0
            ? `${gainers.length} gainer${gainers.length === 1 ? "" : "s"} over ${meta.lookbackDays} sessions`
            : "No gainers in this run"}
        </h2>
        <RunWeeklyMoversTable rows={gainers} lookbackDays={meta.lookbackDays} />
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${highlight ? "text-violet-700" : "text-zinc-900"}`}>
        {value}
      </p>
    </div>
  );
}
