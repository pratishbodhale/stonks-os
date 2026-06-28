export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startDailyScanScheduler } = await import("@/lib/daily-scan-scheduler");
  startDailyScanScheduler();
}
