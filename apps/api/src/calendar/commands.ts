import * as Effect from "effect/Effect";
import {
  CalendarConsent,
  SetCalendarConsent,
  CalendarConsentReceipt,
  BeginBusyCapture,
  BusyCapture,
  PublishBusy,
  BusyPublishReceipt,
} from "@nest/contracts/calendar";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode } from "./codec.ts";
export function calendarCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const householdId = caller.member.householdId;
  const owner = { version: 1 as const, actorId: caller.member.userId, householdId };
  const rpc = (name: string, body: object = {}) =>
    requestJson(config, caller.token, `rest/v1/rpc/${name}`, { p_household: householdId, ...body });
  return {
    consent: () =>
      Effect.gen(function* () {
        const consent = yield* decode(CalendarConsent, yield* rpc("nest_get_calendar_consent"));
        return { ...owner, consent };
      }),
    setConsent: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(SetCalendarConsent, input, "invalid_request");
        const revision = yield* rpc("nest_set_calendar_consent", {
          p_incarnation: command.incarnation.toLowerCase(),
          p_operation: command.operationId.toLowerCase(),
          p_expected: command.expectedRevision,
          p_enabled: command.enabled,
        });
        if (revision !== String(BigInt(command.expectedRevision) + 1n))
          return yield* new ApiFailure({ code: "unavailable" });
        return yield* decode(CalendarConsentReceipt, {
          ...owner,
          operationId: command.operationId.toLowerCase(),
          consent: {
            incarnation: command.incarnation.toLowerCase(),
            version: revision,
            enabled: command.enabled,
          },
        });
      }),
    begin: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(BeginBusyCapture, input, "invalid_request");
        const capture = yield* decode(
          BusyCapture,
          yield* rpc("nest_begin_busy_capture", {
            p_incarnation: command.incarnation.toLowerCase(),
            p_consent: command.consent,
          }),
        );
        if (
          capture.incarnation !== command.incarnation.toLowerCase() ||
          capture.consent !== command.consent
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return { ...owner, capture };
      }),
    publish: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(PublishBusy, input, "invalid_request");
        const expiresAt = yield* rpc("nest_publish_busy", {
          p_incarnation: command.incarnation.toLowerCase(),
          p_consent: command.consent,
          p_generation: command.generation,
          p_start: command.covered.start,
          p_end: command.covered.end,
          p_intervals: command.intervals,
        });
        return yield* decode(BusyPublishReceipt, {
          ...owner,
          incarnation: command.incarnation.toLowerCase(),
          consent: command.consent,
          generation: command.generation,
          expiresAt,
        });
      }),
  };
}
