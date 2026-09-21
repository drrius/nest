// Audited legacy date semantics; see docs/native-rewrite/money-recurring-audit.md.
import {
  addDays,
  clampDayOfMonth,
  fromUtcParts,
  isoWeekday,
  splitIsoDate,
  utcDate,
} from "../routines/dates.ts";
import { asIsoDate, type IsoDate } from "../routines/types.ts";
export type RecurringSchedule =
  | { kind: "weekly"; weekday: number }
  | { kind: "monthly"; dayOfMonth: number };
function validateSchedule(schedule: RecurringSchedule) {
  switch (schedule.kind) {
    case "weekly":
      return validOrdinal(schedule.weekday, 7);
    case "monthly":
      return validOrdinal(schedule.dayOfMonth, 31);
    default:
      throw new Error("Unsupported recurring expense schedule");
  }
}
function validOrdinal(value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error("Invalid recurring schedule day");
}
/** First due civil date on/after the bound; null means the supported date range is exhausted. */
export function firstRecurringDate(
  schedule: RecurringSchedule,
  fromInclusive: string,
): IsoDate | null {
  validateSchedule(schedule);
  const from = asIsoDate(fromInclusive);
  if (schedule.kind === "monthly") return monthlyOnOrAfter(schedule.dayOfMonth, from);
  const offset = (schedule.weekday - isoWeekday(from) + 7) % 7;
  const { year, month, day } = splitIsoDate(from);
  if (utcDate(year, month, day + offset).getUTCFullYear() > 9999) return null;
  return addDays(from, offset);
}
function monthlyOnOrAfter(day: number, from: IsoDate): IsoDate | null {
  const { year, month } = splitIsoDate(from);
  const current = fromUtcParts(year, month, clampDayOfMonth(year, month, day));
  if (current >= from) return current;
  const next = utcDate(year, month + 1, 1),
    nextYear = next.getUTCFullYear(),
    nextMonth = next.getUTCMonth() + 1;
  if (nextYear > 9999) return null;
  return fromUtcParts(nextYear, nextMonth, clampDayOfMonth(nextYear, nextMonth, day));
}
export function nextRecurringDate(
  schedule: RecurringSchedule,
  afterExclusive: string,
): IsoDate | null {
  validateSchedule(schedule);
  const date = asIsoDate(afterExclusive);
  return date === "9999-12-31" ? null : firstRecurringDate(schedule, addDays(date, 1));
}
/** Bounded catch-up planning only: this grants no posting authority or backfill consent. */
export function dueRecurringDates(
  schedule: RecurringSchedule,
  window: { from: string; through: string; limit: number },
) {
  validateSchedule(schedule);
  const from = asIsoDate(window.from),
    through = asIsoDate(window.through);
  validOrdinal(window.limit, 100);
  const dates: IsoDate[] = [];
  if (from > through) return { dates, next: null };
  let candidate = firstRecurringDate(schedule, from);
  while (candidate !== null && candidate <= through && dates.length < window.limit) {
    dates.push(candidate);
    candidate = nextRecurringDate(schedule, candidate);
  }
  return { dates, next: candidate !== null && candidate <= through ? candidate : null };
}
