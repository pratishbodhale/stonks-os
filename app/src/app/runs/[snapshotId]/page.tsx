import Link from "next/link";
import { notFound } from "next/navigation";
import { RunResultsTable } from "@/components/RunResultsTable";
import {
  DAILY_VOLUME_SPIKE_THRESHOLD,
  DAILY_SCAN_UNIVERSE,
  filterDailyVolumeSpikes,
} from "@/lib/daily-volume-scan";
import { getSnapshotMeta, getSnapshotRows } from "@/lib/db";

type RunPageProps = {
  params: Promise<{ snapshotId: string }>;
};

export async function generateMetadata({ params }: RunPageProps) {
  const { snapshotId } = await params;
  return {
    title: `Daily volume scan #${snapshotId}`,
    description: `NIFTY 500 volume analysis — stocks with ${DAILY_VOLUME_SPIKE_THRESHOLD}×+ volume vs pre-move 20-session average for scan run #${snapshotId}`,
  };
}

export default async function RunPage({ params }: RunPageProps) {
  const { snapshotId: idStr } = await params;
  const snapshotId = Number(idStr);
  if (!Number.isFinite(snapshotId) || snapshotId < 1) {
    notFound();
  }

  const meta = getSnapshotMeta(snapshotId);
  if (!meta) {
    notFound();
  }

  const spikes = filterDailyVolumeSpikes(getSnapshotRows(snapshotId));

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
            Daily scan · Volume analysis
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Run #{snapshotId}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            NIFTY {meta.niftyUniverse || DAILY_SCAN_UNIVERSE} stocks with volume at least{" "}
            {DAILY_VOLUME_SPIKE_THRESHOLD}× a 20-session average from before the last 5 trading
            days, as captured when this daily job ran.
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
          label="Volume spikes"
          value={`${spikes.length} at ${DAILY_VOLUME_SPIKE_THRESHOLD}×+`}
          highlight={spikes.length > 0}
        />
      </section>

      <div>
        <h2 className="mb-3 text-lg font-medium text-zinc-900">
          {spikes.length > 0
            ? `${spikes.length} stock${spikes.length === 1 ? "" : "s"} with unusual volume`
            : "No spikes in this run"}
        </h2>
        <RunResultsTable rows={spikes} />
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
