import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
import { householdDayWindow } from "@nest/domain/calendar";
import type { makeCalendarReader } from "./service.ts";
import type { Window } from "./availability.ts";

export function choreDayWindow(date: string): Window | null {
  return Schema.is(CalendarDate)(date) ? householdDayWindow(date) : null;
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
