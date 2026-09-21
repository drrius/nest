import {
  addDays,
  daysInMonth,
  fromUtcParts,
  isoWeekday,
  splitIsoDate,
  utcDate,
} from "../routines/dates.ts";
import { asIsoDate, type IsoDate } from "../routines/types.ts";
import { firstRecurringDate, nextRecurringDate, type RecurringSchedule } from "./recurrence.ts";

export type RecurringCycle = {
  /** Unique only within a rule; due-day and configuration edits do not change this key. */
  key: string;
  dueOn: IsoDate;
  startsOn: IsoDate;
  through: IsoDate;
};

/** Civil period identity. The caller must also bind the household and immutable rule ID. */
export function recurringCycle(schedule: RecurringSchedule, dueDate: string): RecurringCycle {
  const dueOn = asIsoDate(dueDate);
  if (firstRecurringDate(schedule, dueOn) !== dueOn)
    throw new Error("Date is not due under this recurring schedule");
  const { year, month } = splitIsoDate(dueOn);
  const startsOn =
    schedule.kind === "monthly"
      ? fromUtcParts(year, month, 1)
      : addDays(dueOn, 1 - isoWeekday(dueOn));
  const through =
    schedule.kind === "monthly"
      ? fromUtcParts(year, month, daysInMonth(year, month))
      : weekEnd(startsOn);
  return { key: `${schedule.kind}:${startsOn}`, dueOn, startsOn, through };
}

function weekEnd(startsOn: IsoDate): IsoDate {
  const { year, month, day } = splitIsoDate(startsOn);
  return utcDate(year, month, day + 6).getUTCFullYear() > 9999
    ? asIsoDate("9999-12-31")
    : addDays(startsOn, 6);
}

/**
 * Prospective planning after consumed coverage, including a cadence change.
 * Coverage must come from durable, serialized cycle claims, never a client assertion.
 * This grants no mandate, backfill, or ledger-write authority.
 */
export function firstUncoveredRecurringCycle(
  schedule: RecurringSchedule,
  bounds: { from: string; coveredThrough: string | null },
): RecurringCycle | null {
  const from = asIsoDate(bounds.from);
  const covered = bounds.coveredThrough === null ? null : asIsoDate(bounds.coveredThrough);
  // Validate the schedule even when coverage has exhausted the supported range.
  let due = firstRecurringDate(schedule, from);
  if (covered === "9999-12-31") return null;
  if (covered !== null && covered >= from) due = firstRecurringDate(schedule, addDays(covered, 1));
  if (due === null) return null;
  const cycle = recurringCycle(schedule, due);
  if (covered === null || cycle.startsOn > covered) return cycle;
  const next = nextRecurringDate(schedule, due);
  return next === null ? null : recurringCycle(schedule, next);
}
