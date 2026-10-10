import * as Effect from "effect/Effect";
import type { CalendarConsent } from "@nest/contracts/calendar";
import { PreferenceFailure } from "../preferences/client.ts";
import type { OfflineFailure } from "../offline/contracts.ts";
import type { CalendarSelection } from "./selection.ts";
import type { CalendarClient } from "./client.ts";
import type { makeCalendarReader } from "./service.ts";
export function refreshCalendar(
  client: CalendarClient,
  reader: ReturnType<typeof makeCalendarReader>,
  request: { selection: Extract<CalendarSelection, { status: "active" }>; now: number },
  revoke: () => Effect.Effect<
    { consent: CalendarConsent; selection: CalendarSelection | null },
    PreferenceFailure | OfflineFailure
  >,
) {
  const { selection, now } = request;
  return Effect.gen(function* () {
    const consent = selection.consent;
    const capture = yield* client.begin({
      incarnation: consent.incarnation,
      consent: consent.version,
    });
    const snapshot = yield* reader.capture(
      selection.calendarIds,
      { start: now, end: now + 31 * 86400000 },
      Date.parse(capture.capturedAt),
    );
    if (snapshot.status === "unknown") {
      if (snapshot.reason === "permission" || snapshot.reason === "missing_calendar") {
        const result = yield* revoke();
        return { status: "revoked" as const, ...result };
      }
      return { status: "unknown" as const, reason: snapshot.reason };
    }
    const receipt = yield* client.publish({
      incarnation: capture.incarnation,
      consent: capture.consent,
      generation: capture.generation,
      covered: snapshot.covered,
      intervals: snapshot.intervals,
    });
    if (Date.parse(receipt.expiresAt) !== Date.parse(capture.expiresAt))
      return yield* new PreferenceFailure({ code: "unavailable" });
    return { status: "published" as const, expiresAt: receipt.expiresAt };
  });
}
