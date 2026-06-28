import cron from "node-cron";
import { executeDailyScanJob } from "@/lib/daily-scan";

let started = false;

function isSchedulerEnabled(): boolean {
  const flag = process.env.DAILY_SCAN_CRON_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") {
    return false;
  }
  if (flag === "true" || flag === "1" || flag === "yes") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

export function startDailyScanScheduler(): void {
  if (started || !isSchedulerEnabled()) {
    return;
  }
  started = true;

  cron.schedule(
    "30 16 * * 1-5",
    async () => {
      console.log("[daily-scan-cron] Starting scheduled run…");
      try {
        const result = await executeDailyScanJob({ sendNotification: true });
        console.log("[daily-scan-cron] Finished:", JSON.stringify(result));
      } catch (error) {
        console.error(
          "[daily-scan-cron] Failed:",
          error instanceof Error ? error.message : error,
        );
      }
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log("[daily-scan-cron] Scheduler active — weekdays 16:30 IST");
}
