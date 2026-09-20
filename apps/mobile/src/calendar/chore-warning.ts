import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
import { householdDate } from "@nest/domain/calendar";
import type { makeCalendarReader } from "./service.ts";
import type { Window } from "./availability.ts";

// Find the exact Zurich civil-day boundaries, including 23/25-hour DST days.
export function choreDayWindow(date: string): Window | null {
  if (!Schema.is(CalendarDate)(date)) return null;
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
export function choreCalendarWarning(
  reader: ReturnType<typeof makeCalendarReader>,
  ids: readonly string[],
  date: string,
  now: number,
) {
  const window = choreDayWindow(date);
  if (!window) return Effect.succeed("unknown" as const);
  return reader
    .capture(ids, window, now)
    .pipe(
      Effect.map((result) =>
        result.status === "unknown" ? "unknown" : result.intervals.length ? "busy" : "free",
      ),
    );
}
