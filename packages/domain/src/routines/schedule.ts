// Audited from household-os 4a528c9; see docs/native-rewrite/routine-rules-audit.md.
import {
  addDays,
  clampDayOfMonth,
  compareIsoDates,
  fromUtcParts,
  isoWeekday,
  splitIsoDate,
  utcDate,
} from "./dates.ts";
import { type IsoDate, type IsoWeekday, type ScheduleRule } from "./types.ts";

export { validateScheduleRule } from "./validation.ts";

function nextWeekdayOnOrAfter(fromInclusive: IsoDate, weekday: IsoWeekday): IsoDate {
  const current = isoWeekday(fromInclusive);
  const delta = (weekday - current + 7) % 7;
  return addDays(fromInclusive, delta);
}

function nextMatchingWeekday(fromExclusive: IsoDate, days: readonly IsoWeekday[]): IsoDate {
  const sorted = [...days].sort((a, b) => a - b);
  let candidate = addDays(fromExclusive, 1);

  for (let step = 0; step < 8; step += 1) {
    if (sorted.includes(isoWeekday(candidate))) {
      return candidate;
    }

    candidate = addDays(candidate, 1);
  }

  throw new Error("Failed to find next weekday match");
}

function nextMonthlyOnOrAfter(fromInclusive: IsoDate, dayOfMonth: number): IsoDate {
  const { year, month } = splitIsoDate(fromInclusive);
  const clampedThisMonth = clampDayOfMonth(year, month, dayOfMonth);
  const thisMonthDate = fromUtcParts(year, month, clampedThisMonth);

  if (compareIsoDates(thisMonthDate, fromInclusive) >= 0) {
    return thisMonthDate;
  }

  const next = utcDate(year, month + 1, 1);
  const nextYear = next.getUTCFullYear();
  const nextMonth = next.getUTCMonth() + 1;
  return fromUtcParts(nextYear, nextMonth, clampDayOfMonth(nextYear, nextMonth, dayOfMonth));
}

export function nextCalendarDueDate(
  rule: Extract<ScheduleRule, { kind: "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" }>,
  afterDate: IsoDate,
): IsoDate {
  switch (rule.kind) {
    case "daily":
      return addDays(afterDate, 1);
    case "weekdays":
      return nextMatchingWeekday(afterDate, rule.days);
    case "weekly":
      return nextWeekdayOnOrAfter(addDays(afterDate, 1), rule.weekday);
    case "biweekly":
      // A full week past the weekly successor, so an on-weekday closure
      // yields exactly fourteen days.
      return nextWeekdayOnOrAfter(addDays(afterDate, 8), rule.weekday);
    case "monthly":
      return nextMonthlyOnOrAfter(addDays(afterDate, 1), rule.dayOfMonth);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export function firstDueDateOnOrAfter(rule: ScheduleRule, fromInclusive: IsoDate): IsoDate {
  switch (rule.kind) {
    case "one_off":
      return rule.date;
    case "daily":
      return fromInclusive;
    case "weekdays":
      if (rule.days.includes(isoWeekday(fromInclusive))) {
        return fromInclusive;
      }

      return nextMatchingWeekday(fromInclusive, rule.days);
    case "weekly":
    case "biweekly":
      return nextWeekdayOnOrAfter(fromInclusive, rule.weekday);
    case "monthly":
      return nextMonthlyOnOrAfter(fromInclusive, rule.dayOfMonth);
    case "after_completion":
      return nextAfterCompletionDueDate(rule, fromInclusive);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export function nextAfterCompletionDueDate(
  rule: Extract<ScheduleRule, { kind: "after_completion" }>,
  completedOn: IsoDate,
): IsoDate {
  const days = rule.unit === "weeks" ? rule.every * 7 : rule.every;
  return addDays(completedOn, days);
}

export function nextDueAfterClosure(input: {
  rule: ScheduleRule;
  closedDueDate: IsoDate;
  completedOn?: IsoDate;
  /**
   * The closed occurrence's due date before any reschedule. Biweekly phase
   * is invisible in the weekday alone, so per ADR 0014 succession anchors on
   * this date; rescheduling then moves only the closed occurrence.
   */
  originalDueDate?: IsoDate;
}): IsoDate | null {
  const { rule, closedDueDate, completedOn, originalDueDate } = input;

  switch (rule.kind) {
    case "one_off":
      return null;
    case "after_completion": {
      if (completedOn === undefined) {
        return nextCalendarAnchorAfterSkip(rule, closedDueDate);
      }

      return nextAfterCompletionDueDate(rule, completedOn);
    }
    case "biweekly":
      return nextCalendarDueDate(rule, originalDueDate ?? closedDueDate);
    case "daily":
    case "weekdays":
    case "weekly":
    case "monthly":
      return nextCalendarDueDate(rule, closedDueDate);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

function nextCalendarAnchorAfterSkip(
  rule: Extract<ScheduleRule, { kind: "after_completion" }>,
  closedDueDate: IsoDate,
): IsoDate {
  return nextAfterCompletionDueDate(rule, closedDueDate);
}
