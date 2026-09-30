import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { projectBusy, availabilityFor } from "../src/calendar/availability.ts";
import { makeCalendarReader } from "../src/calendar/service.ts";

const ms = (iso) => Date.parse(iso);
const covered = { start: ms("2026-03-28T00:00:00Z"), end: ms("2026-03-31T00:00:00Z") };
const capturedAt = covered.start;
const event = (startDate, endDate, fields = {}) => ({
  calendarId: "personal",
  startDate,
  endDate,
  availability: "busy",
  status: "confirmed",
  title: "Private doctor",
  location: "Private clinic",
  notes: "Private note",
  url: "https://private.invalid",
  ...fields,
});
const baseline = event("2026-03-29T09:00:00+02:00", "2026-03-29T10:00:00+02:00");
const project = (events) => projectBusy(events, ["personal"], covered, capturedAt);
const port = (overrides = {}) => ({
  permission: async () => true,
  requestPermission: async () => true,
  calendars: async () => [{ id: "personal", title: "Private calendar" }],
  events: async () => [baseline],
  ...overrides,
});

test("projection exports only merged clipped intervals and no event/calendar metadata", () => {
  const snapshot = project([
    baseline,
    event("2026-03-29T09:30:00+02:00", "2026-03-29T11:00:00+02:00"),
    event("2026-03-27T00:00:00Z", "2026-03-28T01:00:00Z"),
  ]);
  assert.deepEqual(snapshot, {
    status: "known",
    schemaVersion: 1,
    capturedAt,
    covered,
    intervals: [
      { start: covered.start, end: ms("2026-03-28T01:00:00Z") },
      { start: ms("2026-03-29T07:00:00Z"), end: ms("2026-03-29T09:00:00Z") },
    ],
  });
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /Private|personal|calendarId|location|notes|url|title/,
  );
});

test("free, canceled and unselected calendars do not become busy blocks", () => {
  assert.deepEqual(
    project([
      { ...baseline, availability: "free" },
      { ...baseline, status: "canceled" },
      { ...baseline, calendarId: "work-not-shared" },
    ]).intervals,
    [],
  );
  assert.equal(project([{ ...baseline, availability: "notSupported" }]).intervals.length, 1);
  assert.equal(project([{ ...baseline, availability: "tentative" }]).intervals.length, 1);
});

test("native all-day absolute bounds preserve the 23-hour Zurich DST day", () => {
  const snapshot = project([
    event("2026-03-29T00:00:00+01:00", "2026-03-30T00:00:00+02:00", { allDay: true }),
  ]);
  assert.equal(snapshot.intervals[0].end - snapshot.intervals[0].start, 23 * 60 * 60 * 1000);
});

test("the 25-hour autumn day is not truncated to 24 hours", () => {
  const start = ms("2026-10-25T00:00:00+02:00");
  const end = ms("2026-10-26T00:00:00+01:00");
  const snapshot = projectBusy(
    [event(new Date(start), new Date(end), { allDay: true })],
    ["personal"],
    { start, end },
    start,
  );
  assert.equal(snapshot.intervals[0].end - snapshot.intervals[0].start, 25 * 60 * 60 * 1000);
});

test("floating, invalid and reversed dates cannot silently prove availability", () => {
  for (const startDate of ["2026-03-29", "invalid", "2026-03-30T00:00:00Z"]) {
    assert.deepEqual(project([{ ...baseline, startDate }]), {
      status: "unknown",
      reason: "invalid_events",
    });
  }
});

test("stale, future and out-of-coverage snapshots are unknown; boundaries are half-open", () => {
  const snapshot = project([baseline]);
  const busy = { start: ms("2026-03-29T07:00:00Z"), end: ms("2026-03-29T08:00:00Z") };
  assert.equal(availabilityFor(snapshot, busy, capturedAt, 1000), "busy");
  assert.equal(
    availabilityFor(snapshot, { start: busy.end, end: busy.end + 1000 }, capturedAt, 1000),
    "free",
  );
  assert.equal(availabilityFor(snapshot, busy, capturedAt + 1000, 1000), "unknown");
  assert.equal(availabilityFor(snapshot, busy, capturedAt - 1, 1000), "unknown");
  assert.equal(
    availabilityFor(snapshot, { start: covered.start - 1, end: covered.end }, capturedAt, 1000),
    "unknown",
  );
  assert.equal(
    availabilityFor({ status: "unknown", reason: "disabled" }, busy, capturedAt, 1000),
    "unknown",
  );
});

test("revocation during the event read discards the pending projection", async () => {
  let reads = 0;
  const reader = makeCalendarReader(port({ permission: async () => ++reads === 1 }));
  assert.deepEqual(await Effect.runPromise(reader.capture(["personal"], covered, capturedAt)), {
    status: "unknown",
    reason: "permission",
  });
});

test("missing/restricted calendar and fetch failures do not report an empty known snapshot", async () => {
  const missing = makeCalendarReader(port({ calendars: async () => [] }));
  assert.deepEqual(await Effect.runPromise(missing.capture(["personal"], covered, capturedAt)), {
    status: "unknown",
    reason: "missing_calendar",
  });
  const failed = makeCalendarReader(
    port({
      events: async () => {
        throw new Error("Private upstream message");
      },
    }),
  );
  const result = await Effect.runPromise(failed.capture(["personal"], covered, capturedAt));
  assert.deepEqual(result, { status: "unknown", reason: "unavailable" });
  assert.doesNotMatch(JSON.stringify(result), /Private/);
});

test("no opt-in means no permission or event access and is never confirmed free time", async () => {
  const reader = makeCalendarReader(
    port({
      permission: async () => {
        assert.fail("should not request access");
      },
    }),
  );
  assert.deepEqual(await Effect.runPromise(reader.capture([], covered, capturedAt)), {
    status: "unknown",
    reason: "disabled",
  });
});

test("recurrence exceptions are taken from EventKit occurrences without re-expanding the original rule", () => {
  const snapshot = project([
    event("2026-03-29T12:00:00Z", "2026-03-29T13:00:00Z", {
      isDetached: true,
      originalStartDate: "2026-03-29T07:00:00Z",
      recurrenceRule: { frequency: "daily" },
    }),
  ]);
  assert.deepEqual(snapshot.intervals, [
    { start: ms("2026-03-29T12:00:00Z"), end: ms("2026-03-29T13:00:00Z") },
  ]);
});
