import { refreshCalendar } from "./refresh.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { CalendarConsent } from "@nest/contracts/calendar";
import { PreferenceFailure } from "../preferences/client.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import { CalendarIds, sameConsent, type CalendarSelection } from "./selection.ts";
import type { CalendarClient } from "./client.ts";
import type { makeCalendarReader } from "./service.ts";
type Reader = ReturnType<typeof makeCalendarReader>;
export function calendarOperations(
  client: CalendarClient,
  account: OfflineAccount,
  reader: Reader,
  uuid: () => string,
) {
  const save = (value: CalendarSelection | null) =>
    account.store.saveCalendarSelection(account.session, value);
  const stage = (consent: CalendarConsent, calendarIds: readonly string[], enabled: boolean) =>
    Effect.gen(function* () {
      const ids = yield* Schema.decodeUnknownEffect(CalendarIds)(calendarIds).pipe(
        Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
      );
      if (enabled && !ids.length) return yield* new PreferenceFailure({ code: "invalid" });
      const attempt = {
        status: "pending" as const,
        command: {
          incarnation: consent.incarnation,
          operationId: uuid(),
          expectedRevision: consent.version,
          enabled,
        },
        calendarIds: enabled ? ids : [],
      };
      yield* save(attempt);
      return attempt;
    });
  const resolve = (attempt: Extract<CalendarSelection, { status: "pending" }>) =>
    Effect.gen(function* () {
      const receipt = yield* client.setConsent(attempt.command);
      const consent = yield* client.consent();
      const selection: CalendarSelection | null =
        sameConsent(consent, receipt) && consent.enabled
          ? { status: "active", consent, calendarIds: attempt.calendarIds }
          : null;
      yield* save(selection);
      return { consent, selection };
    }).pipe(
      Effect.catchIf(
        (error) => Schema.is(PreferenceFailure)(error) && error.code === "conflict",
        () =>
          Effect.gen(function* () {
            yield* save(null);
            return { consent: yield* client.consent(), selection: null };
          }),
      ),
    );
  return {
    save,
    stage,
    resolve,
    load: () =>
      Effect.gen(function* () {
        const consent = yield* client.consent();
        let selection = yield* account.store.readCalendarSelection(account.session);
        if (selection?.status === "active" && !sameConsent(selection.consent, consent)) {
          yield* save(null);
          selection = null;
        }
        const local = yield* reader.localCalendars;
        return { consent, selection, local };
      }),
    permission: reader.requestPermission,
    local: reader.localCalendars,
    refresh: (selection: Extract<CalendarSelection, { status: "active" }>, now: number) =>
      refreshCalendar(client, reader, { selection, now }, () =>
        Effect.gen(function* () {
          const attempt = yield* stage(selection.consent, [], false);
          return yield* resolve(attempt);
        }),
      ),
  };
}
export type CalendarOperations = ReturnType<typeof calendarOperations>;
