import { appConfig } from "@/config/app";

/**
 * Dashboard period filter. All boundaries are midnight in the app time zone
 * (Malaysia, UTC+8, no DST); `to` is exclusive.
 */
export type PeriodKey = "7d" | "30d" | "semester" | "custom";
export type Period = { key: PeriodKey; from: Date; to: Date; fromDate: string; toDate: string };

const DAY = 24 * 60 * 60 * 1000;
const OFFSET = appConfig.utcOffsetHours * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of an instant, in the app time zone. */
export function localDate(d: Date): string {
  return new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
}

/** The instant of local midnight at the start of a "YYYY-MM-DD" day. */
export function localMidnight(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - OFFSET);
}

export function semesterStart(now: Date): string {
  const [y, m] = localDate(now).split("-").map(Number);
  const starts = [...appConfig.semesterStartMonths].sort((a, b) => a - b);
  const current = [...starts].reverse().find((s) => s <= m);
  return current ? `${y}-${String(current).padStart(2, "0")}-01` : `${y - 1}-${String(starts.at(-1)).padStart(2, "0")}-01`;
}

export function resolvePeriod(params: { period?: string; from?: string; to?: string }, now = new Date()): Period {
  const tomorrow = localMidnight(localDate(new Date(now.getTime() + DAY)));
  const make = (key: PeriodKey, from: Date, to: Date): Period => ({
    key,
    from,
    to,
    fromDate: localDate(from),
    toDate: localDate(new Date(to.getTime() - DAY)),
  });

  if (params.period === "custom" && params.from && params.to && DATE_RE.test(params.from) && DATE_RE.test(params.to)) {
    let from = localMidnight(params.from);
    let to = new Date(localMidnight(params.to).getTime() + DAY);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      if (from >= to) [from, to] = [new Date(to.getTime() - DAY), new Date(from.getTime() + DAY)];
      // Keep custom ranges sane (max ~3 years).
      if (to.getTime() - from.getTime() > 1100 * DAY) from = new Date(to.getTime() - 1100 * DAY);
      return make("custom", from, to);
    }
  }
  if (params.period === "7d") return make("7d", new Date(tomorrow.getTime() - 7 * DAY), tomorrow);
  if (params.period === "semester") return make("semester", localMidnight(semesterStart(now)), tomorrow);
  return make("30d", new Date(tomorrow.getTime() - 30 * DAY), tomorrow);
}
