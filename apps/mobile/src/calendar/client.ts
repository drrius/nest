import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CalendarConsentEnvelope,
  CalendarConsentReceipt,
  SetCalendarConsent,
  BeginBusyCapture,
  BusyCaptureEnvelope,
  BusyPublishReceipt,
  PublishBusy,
  BusySnapshotsEnvelope,
} from "@nest/contracts/calendar";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const match = <A>(value: A, valid: boolean) =>
  valid ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function calendarClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = <A extends { actorId: string; householdId: string }>(
    path: string,
    schema: Schema.Codec<A>,
    body?: object,
  ) =>
    request(path, schema, body).pipe(
      Effect.flatMap((value) =>
        match(value, value.actorId === account.actor && value.householdId === account.household),
      ),
    );
  return {
    consent: () =>
      scoped("v1/calendar/consent", CalendarConsentEnvelope).pipe(
        Effect.map((value) => value.consent),
      ),
    setConsent: (input: SetCalendarConsent) =>
      validate(SetCalendarConsent, input).pipe(
        Effect.flatMap((command) =>
          scoped("v1/calendar/consent/set", CalendarConsentReceipt, command),
        ),
        Effect.flatMap((value) =>
          match(
            value.consent,
            value.operationId === input.operationId.toLowerCase() &&
              value.consent.incarnation === input.incarnation.toLowerCase() &&
              value.consent.enabled === input.enabled &&
              value.consent.version === String(BigInt(input.expectedRevision) + 1n),
          ),
        ),
      ),
    begin: (input: typeof BeginBusyCapture.Type) =>
      validate(BeginBusyCapture, input).pipe(
        Effect.flatMap((command) => scoped("v1/calendar/capture", BusyCaptureEnvelope, command)),
        Effect.flatMap(({ capture }) =>
          match(
            capture,
            capture.incarnation === input.incarnation.toLowerCase() &&
              capture.consent === input.consent,
          ),
        ),
      ),
    publish: (input: PublishBusy) =>
      validate(PublishBusy, input).pipe(
        Effect.flatMap((command) => scoped("v1/calendar/publish", BusyPublishReceipt, command)),
        Effect.flatMap((value) =>
          match(
            value,
            value.incarnation === input.incarnation.toLowerCase() &&
              value.consent === input.consent &&
              value.generation === input.generation,
          ),
        ),
      ),
    snapshots: () =>
      request("v1/calendar/busy", BusySnapshotsEnvelope).pipe(
        Effect.flatMap((value) => match(value.snapshots, value.householdId === account.household)),
      ),
  };
}
export type CalendarClient = ReturnType<typeof calendarClient>;
