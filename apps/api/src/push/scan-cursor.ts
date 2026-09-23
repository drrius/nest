import * as Schema from "effect/Schema";
function validCalendar(value: string) {
  const date = value.slice(0, 10);
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return (
    !date.startsWith("0000-") &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === date &&
    Number.isFinite(Date.parse(value))
  );
}
const Instant = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$(?![\s\S])/,
  ),
  Schema.makeFilter(validCalendar),
);
const Uuid = Schema.String.check(Schema.isUUID());
export const PushScanCursorSchema = Schema.Struct({
  dueAt: Instant,
  outboxId: Uuid,
  installationId: Uuid,
});
export type PushScanCursor = typeof PushScanCursorSchema.Type;
function micros(value: string) {
  const fraction = /\.(\d{1,6})/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3));
}
/** PostgreSQL timestamptz keeps microseconds; Date alone would collapse distinct cursors. */
export function cursorAdvances(next: PushScanCursor, prior: PushScanCursor) {
  const nextTime = micros(next.dueAt),
    priorTime = micros(prior.dueAt);
  if (nextTime !== priorTime) return nextTime > priorTime;
  const nextOutbox = next.outboxId.toLowerCase(),
    priorOutbox = prior.outboxId.toLowerCase();
  if (nextOutbox !== priorOutbox) return nextOutbox > priorOutbox;
  return next.installationId.toLowerCase() > prior.installationId.toLowerCase();
}
