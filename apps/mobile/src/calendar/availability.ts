export interface Window {
  readonly start: number;
  readonly end: number;
}
export interface DeviceEvent {
  readonly calendarId: string;
  readonly startDate: Date | string;
  readonly endDate: Date | string;
  readonly availability: string;
  readonly status: string;
}
export type Availability =
  | {
      readonly status: "unknown";
      readonly reason:
        | "disabled"
        | "permission"
        | "missing_calendar"
        | "invalid_events"
        | "unavailable";
    }
  | {
      readonly status: "known";
      readonly schemaVersion: 1;
      readonly capturedAt: number;
      readonly covered: Window;
      readonly intervals: readonly Window[];
    };

export function validWindow(window: Window): boolean {
  return (
    Number.isSafeInteger(window.start) &&
    Number.isSafeInteger(window.end) &&
    window.start < window.end &&
    window.end - window.start <= 31 * 86_400_000
  );
}
function instant(value: Date | string): number {
  if (typeof value === "string" && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return new Date(value).getTime();
}
export function projectBusy(
  events: readonly DeviceEvent[],
  selected: readonly string[],
  covered: Window,
  capturedAt: number,
): Availability {
  if (!validWindow(covered) || !Number.isSafeInteger(capturedAt))
    return { status: "unknown", reason: "invalid_events" };
  if (selected.length === 0) return { status: "unknown", reason: "disabled" };
  const intervals: Window[] = [];
  for (const event of events) {
    if (!blocksTime(event, selected)) continue;
    const start = instant(event.startDate);
    const end = instant(event.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
      return { status: "unknown", reason: "invalid_events" };
    const clipped = { start: Math.max(start, covered.start), end: Math.min(end, covered.end) };
    if (clipped.start < clipped.end) intervals.push(clipped);
  }
  return {
    status: "known",
    schemaVersion: 1,
    capturedAt,
    covered: { start: covered.start, end: covered.end },
    intervals: merge(intervals),
  };
}
function merge(intervals: Window[]): Window[] {
  const result: Window[] = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = result.at(-1);
    if (previous && interval.start <= previous.end) {
      result[result.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, interval.end),
      };
    } else result.push({ start: interval.start, end: interval.end });
  }
  return result;
}
export function availabilityFor(
  snapshot: Availability,
  query: Window,
  now: number,
  maxAge: number,
): "unknown" | "busy" | "free" {
  if (snapshot.status !== "known" || !validWindow(query)) return "unknown";
  if (!isFresh(now - snapshot.capturedAt, maxAge)) return "unknown";
  if (query.start < snapshot.covered.start || query.end > snapshot.covered.end) return "unknown";
  return snapshot.intervals.some(
    (interval) => interval.start < query.end && interval.end > query.start,
  )
    ? "busy"
    : "free";
}

function blocksTime(event: DeviceEvent, selected: readonly string[]) {
  return (
    selected.includes(event.calendarId) &&
    event.status !== "canceled" &&
    event.availability !== "free"
  );
}
function isFresh(age: number, maxAge: number) {
  return Number.isFinite(age) && Number.isFinite(maxAge) && maxAge > 0 && age >= 0 && age < maxAge;
}
