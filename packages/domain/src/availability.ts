export interface TimeRange {
  readonly start: number;
  readonly end: number;
}
export interface BusyEvidence {
  readonly covered: TimeRange;
  readonly intervals: readonly TimeRange[];
  readonly capturedAt: number;
  readonly expiresAt: number;
}
const validRange = (value: TimeRange) =>
  Number.isSafeInteger(value.start) &&
  Number.isSafeInteger(value.end) &&
  value.start >= 0 &&
  value.end <= 253402300799999 &&
  value.start < value.end &&
  value.end - value.start <= 2678400000;
export function assessAvailability(evidence: BusyEvidence | null, query: TimeRange, now: number) {
  if (!evidence || !validRange(query) || !validEvidence(evidence, now))
    return { status: "unknown" as const };
  if (query.start < evidence.covered.start || query.end > evidence.covered.end)
    return { status: "unknown" as const };
  const intervals = evidence.intervals
    .filter((interval) => interval.start < query.end && interval.end > query.start)
    .map((interval) => ({
      start: Math.max(query.start, interval.start),
      end: Math.min(query.end, interval.end),
    }));
  return {
    status: intervals.length ? ("busy" as const) : ("free" as const),
    intervals,
    capturedAt: evidence.capturedAt,
    expiresAt: evidence.expiresAt,
  };
}
function validEvidence(value: BusyEvidence, now: number) {
  return (
    Number.isSafeInteger(now) &&
    Number.isSafeInteger(value.capturedAt) &&
    Number.isSafeInteger(value.expiresAt) &&
    value.capturedAt <= now &&
    value.expiresAt > now &&
    value.expiresAt - value.capturedAt === 900000 &&
    validRange(value.covered) &&
    value.intervals.length <= 512 &&
    value.intervals.every(
      (interval) =>
        validRange(interval) &&
        interval.start >= value.covered.start &&
        interval.end <= value.covered.end,
    )
  );
}
