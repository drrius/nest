import { addDays } from "./routines/dates.ts";
import { asIsoDate } from "./routines/types.ts";

/** Civil cancellation deadline; null means the date or lead time cannot be represented. */
export function renewalDeadline(renewalOn: string, noticeDays: number): string | null {
  if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 730) return null;
  try {
    return addDays(asIsoDate(renewalOn), -noticeDays);
  } catch {
    return null;
  }
}
