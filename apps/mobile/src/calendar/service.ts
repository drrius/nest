import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  projectBusy,
  validWindow,
  type Availability,
  type DeviceEvent,
  type Window,
} from "./availability.ts";

export interface LocalCalendar {
  readonly id: string;
  readonly title: string;
  readonly color?: string;
}
export interface CalendarPort {
  permission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  calendars(): Promise<readonly LocalCalendar[]>;
  events(ids: readonly string[], window: Window): Promise<readonly DeviceEvent[]>;
}
class CalendarFailure extends Schema.TaggedError<CalendarFailure>()("CalendarFailure", {}) {}
const call = <A>(body: () => Promise<A>) =>
  Effect.tryPromise({ try: body, catch: () => new CalendarFailure() }).pipe(
    Effect.timeout("15 seconds"),
    Effect.mapError(() => new CalendarFailure()),
  );

export function makeCalendarReader(port: CalendarPort) {
  const capture = (selected: readonly string[], window: Window, capturedAt: number) =>
    Effect.gen(function* () {
      if (selected.length === 0) return { status: "unknown", reason: "disabled" } as const;
      if (!validWindow(window)) return { status: "unknown", reason: "invalid_events" } as const;
      if (!(yield* call(() => port.permission())))
        return { status: "unknown", reason: "permission" } as const;
      const calendars = yield* call(() => port.calendars());
      if (selected.some((id) => !calendars.some((calendar) => calendar.id === id))) {
        return { status: "unknown", reason: "missing_calendar" } as const;
      }
      const events = yield* call(() => port.events([...new Set(selected)], window));
      if (!(yield* call(() => port.permission())))
        return { status: "unknown", reason: "permission" } as const;
      return projectBusy(events, selected, window, capturedAt);
    }).pipe(Effect.orElseSucceed(() => ({ status: "unknown", reason: "unavailable" }) as const));
  return {
    requestPermission: call(() => port.requestPermission()),
    localCalendars: Effect.gen(function* () {
      if (!(yield* call(() => port.permission()))) return { status: "permission" } as const;
      return { status: "ready", calendars: yield* call(() => port.calendars()) } as const;
    }),
    capture: (
      selected: readonly string[],
      window: Window,
      capturedAt: number,
    ): Effect.Effect<Availability> =>
      capture([...selected], { start: window.start, end: window.end }, capturedAt),
  };
}
export class CalendarReader extends Context.Service<
  CalendarReader,
  ReturnType<typeof makeCalendarReader>
>()("nest/CalendarReader") {}
export const calendarLayer = (port: CalendarPort) =>
  Layer.succeed(CalendarReader, makeCalendarReader(port));
