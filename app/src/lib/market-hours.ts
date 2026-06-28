const IST_TIMEZONE = "Asia/Kolkata";
const NSE_CLOSE_MINUTES = 15 * 60 + 30;

type IstParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

function getIstParts(date = new Date()): IstParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    weekday: weekdayMap[lookup.weekday] ?? 0,
    minutes: Number(lookup.hour) * 60 + Number(lookup.minute),
  };
}

export function formatIstDateKey(date = new Date()): string {
  const { year, month, day } = getIstParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isNseTradingDay(date = new Date()): boolean {
  const { weekday } = getIstParts(date);
  return weekday >= 1 && weekday <= 5;
}

export function isAfterNseMarketClose(date = new Date()): boolean {
  if (!isNseTradingDay(date)) {
    return false;
  }
  return getIstParts(date).minutes >= NSE_CLOSE_MINUTES;
}
