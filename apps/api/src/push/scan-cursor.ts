import * as Schema from "effect/Schema";
const Instant = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$(?![\s\S])/,
  ),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
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
