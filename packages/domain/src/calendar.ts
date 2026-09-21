import { asIsoDate } from "./routines/types.ts";
// Retains private.household_today() from the audited legacy routine engine.
const householdDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function householdDate(instant: Date): string {
  const parts = householdDay.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Find the exact Zurich civil-day boundaries, including 23/25-hour DST days.
export function householdDayWindow(date: string) {
  asIsoDate(date);
  const noon = Date.parse(`${date}T12:00:00Z`);
  const matches = (time: number) => householdDate(new Date(time)).padStart(10, "0") === date;
  const boundary = (left: number, right: number, atStart: boolean) => {
    while (right - left > 1) {
      const middle = Math.floor((left + right) / 2);
      if (matches(middle) === atStart) right = middle;
      else left = middle;
    }
    return right;
  };
  return {
    start: boundary(noon - 86_400_000, noon, true),
    end: boundary(noon, noon + 86_400_000, false),
  };
}
