import { asIsoDate } from "../routines/types.ts";
import type { RecurringSchedule } from "./recurrence.ts";
import { firstUncoveredRecurringCycle } from "./recurring-cycle.ts";
/** A prospective preview only; persisted coverage and authorization belong to the server. */
export function planRecurringResume(
  schedule: RecurringSchedule,
  bounds: { today: string; startDate: string; coveredThrough: string | null },
) {
  const today = asIsoDate(bounds.today),
    start = asIsoDate(bounds.startDate);
  const resumeFrom = today > start ? today : start;
  const cycle = firstUncoveredRecurringCycle(schedule, {
    from: resumeFrom,
    coveredThrough: bounds.coveredThrough,
  });
  return cycle ? { resumeFrom, cycle } : null;
}
