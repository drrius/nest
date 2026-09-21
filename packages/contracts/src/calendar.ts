import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const PositiveRevision = Revision.check(Schema.makeFilter((value: string) => value !== "0"));
const Millis = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 253402300799999 }),
);
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
  Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value))),
);
const Interval = Schema.Struct({ start: Millis, end: Millis });
const CoverageFields = {
  covered: Interval,
  intervals: Schema.Array(Interval).check(Schema.isMaxLength(512)),
};
function validCoverage(value: {
  covered: { start: number; end: number };
  intervals: readonly { start: number; end: number }[];
}) {
  const { start, end } = value.covered;
  if (start >= end || end - start > 2678400000) return false;
  let previous = start - 1;
  for (const interval of value.intervals) {
    if (
      interval.start < start ||
      interval.end > end ||
      interval.start >= interval.end ||
      interval.start <= previous
    )
      return false;
    previous = interval.end;
  }
  return true;
}
export const CalendarConsent = Schema.Struct({
  incarnation: Uuid,
  version: Revision,
  enabled: Schema.Boolean,
});
export const SetCalendarConsent = Schema.Struct({
  incarnation: Uuid,
  operationId: Uuid,
  expectedRevision: Revision,
  enabled: Schema.Boolean,
});
export const BeginBusyCapture = Schema.Struct({ incarnation: Uuid, consent: PositiveRevision });
export const BusyCapture = Schema.Struct({
  ...BeginBusyCapture.fields,
  generation: PositiveRevision,
  capturedAt: Timestamp,
  expiresAt: Timestamp,
}).check(
  Schema.makeFilter(
    (value) => Date.parse(value.expiresAt) - Date.parse(value.capturedAt) === 900000,
  ),
);
export const PublishBusy = Schema.Struct({
  ...BeginBusyCapture.fields,
  generation: PositiveRevision,
  ...CoverageFields,
}).check(Schema.makeFilter(validCoverage));
export const BusySnapshot = Schema.Struct({
  actorId: Uuid,
  schemaVersion: Schema.Literal(1),
  consent: PositiveRevision,
  generation: PositiveRevision,
  capturedAt: Timestamp,
  expiresAt: Timestamp,
  ...CoverageFields,
}).check(
  Schema.makeFilter(validCoverage),
  Schema.makeFilter(
    (value) => Date.parse(value.expiresAt) - Date.parse(value.capturedAt) === 900000,
  ),
);
const Owner = { version: Schema.Literal(1), actorId: Uuid, householdId: Uuid };
export const CalendarConsentEnvelope = Schema.Struct({ ...Owner, consent: CalendarConsent });
export const CalendarConsentReceipt = Schema.Struct({
  ...Owner,
  operationId: Uuid,
  consent: CalendarConsent,
});
export const BusyCaptureEnvelope = Schema.Struct({ ...Owner, capture: BusyCapture });
export const BusyPublishReceipt = Schema.Struct({
  ...Owner,
  incarnation: Uuid,
  consent: PositiveRevision,
  generation: PositiveRevision,
  expiresAt: Timestamp,
});
export const BusySnapshotsEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  snapshots: Schema.Array(BusySnapshot).check(
    Schema.isMaxLength(2),
    Schema.makeFilter((rows) => new Set(rows.map((row) => row.actorId)).size === rows.length),
  ),
});
export type CalendarConsent = typeof CalendarConsent.Type;
export type SetCalendarConsent = typeof SetCalendarConsent.Type;
export type BusyCapture = typeof BusyCapture.Type;
export type PublishBusy = typeof PublishBusy.Type;
export type BusySnapshot = typeof BusySnapshot.Type;

export const AvailabilityQuery = Schema.Struct(Interval.fields).check(
  Schema.makeFilter((covered) => validCoverage({ covered, intervals: [] })),
);
export const CalendarSettingsHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("calendar-sharing"),
});

export const CalendarAgendaHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("calendar"),
});
