import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { projectAgenda, type AgendaEvent, type AgendaResult } from "./agenda.ts";
import { validWindow, type Window } from "./availability.ts";
import { CalendarIds } from "./selection.ts";
import type { LocalCalendar } from "./service.ts";

export interface AgendaPort {
  permission(): Promise<boolean>;
  calendars(): Promise<readonly LocalCalendar[]>;
  events(ids: readonly string[], window: Window): Promise<readonly AgendaEvent[]>;
}
const unavailable = { status: "unavailable", reason: "unavailable" } as const;
const call = <A>(body: () => Promise<A>) =>
  Effect.tryPromise({ try: body, catch: () => unavailable }).pipe(Effect.timeout("15 seconds"));
function available(port: AgendaPort, selected: readonly string[]) {
  return Effect.gen(function* () {
    if (!(yield* call(() => port.permission()))) return "permission" as const;
    const calendars = yield* call(() => port.calendars());
    if (!(yield* call(() => port.permission()))) return "permission" as const;
    return selected.every((id) => calendars.some((calendar) => calendar.id === id))
      ? null
      : ("missing_calendar" as const);
  });
}
export function makeAgendaReader(port: AgendaPort) {
  const read = (ids: readonly string[], window: Window): Effect.Effect<AgendaResult> =>
    Effect.gen(function* () {
      if (!Schema.is(CalendarIds)(ids) || !validWindow(window))
        return { status: "unavailable", reason: "invalid_events" } as const;
      if (ids.length === 0) return { status: "ready", rows: [] } as const;
      const before = yield* available(port, ids);
      if (before) return { status: "unavailable", reason: before } as const;
      const events = yield* call(() => port.events(ids, window));
      const after = yield* available(port, ids);
      if (after) return { status: "unavailable", reason: after } as const;
      return projectAgenda(events, ids, window);
    }).pipe(Effect.orElseSucceed(() => unavailable));
  return {
    read: (ids: readonly string[], window: Window) =>
      read([...ids], { start: window.start, end: window.end }),
  };
}
