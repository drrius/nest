import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { OfflineAccount } from "../offline/owner.ts";
import type { AgendaPort } from "./agenda-reader.ts";
import { makeAgendaReader } from "./agenda-reader.ts";
import { AgendaSelection } from "./agenda-selection.ts";
import type { Window } from "./availability.ts";
import type { LocalCalendar } from "./service.ts";
export type AgendaCatalog =
  | { status: "ready"; calendars: readonly LocalCalendar[] }
  | { status: "permission" };
export class AgendaFailure extends Schema.TaggedError<AgendaFailure>()("AgendaFailure", {
  code: Schema.Literals(["invalid", "unavailable", "missing_calendar"]),
}) {}
export function agendaOperations(
  account: OfflineAccount,
  port: AgendaPort & { requestPermission(): Promise<boolean> },
) {
  const guard = account.store.readAgendaSelection(account.session);
  const catalog = Effect.tryPromise({
    try: async (): Promise<AgendaCatalog> => {
      if (!(await port.permission())) return { status: "permission" };
      const calendars = await port.calendars();
      if (!(await port.permission())) return { status: "permission" };
      return { status: "ready", calendars };
    },
    catch: () => new AgendaFailure({ code: "unavailable" }),
  }).pipe(
    Effect.timeout("15 seconds"),
    Effect.mapError(() => new AgendaFailure({ code: "unavailable" })),
  );
  const reader = makeAgendaReader(port);
  const scoped = <A, E>(work: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* guard;
      const result = yield* work;
      yield* guard;
      return result;
    });
  return {
    load: () =>
      scoped(
        Effect.gen(function* () {
          const selection = yield* guard;
          return { selection, catalog: yield* catalog };
        }),
      ),
    read: (ids: readonly string[], window: Window) => scoped(reader.read(ids, window)),
    permission: () =>
      scoped(
        Effect.tryPromise({
          try: () => port.requestPermission(),
          catch: () => new AgendaFailure({ code: "unavailable" }),
        }).pipe(Effect.timeout("60 seconds")),
      ),
    save: (input: AgendaSelection) =>
      scoped(
        Effect.gen(function* () {
          const selection = yield* Schema.decodeUnknownEffect(AgendaSelection, {
            onExcessProperty: "error",
          })(input).pipe(Effect.mapError(() => new AgendaFailure({ code: "invalid" })));
          if (selection.calendarIds.length) {
            const current = yield* catalog;
            if (
              current.status !== "ready" ||
              selection.calendarIds.some(
                (id) => !current.calendars.some((calendar) => calendar.id === id),
              )
            )
              return yield* new AgendaFailure({ code: "missing_calendar" });
          }
          yield* account.store.saveAgendaSelection(account.session, selection);
          return selection;
        }),
      ),
  };
}
export type AgendaOperations = ReturnType<typeof agendaOperations>;
