import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { projectAgenda } from "../src/calendar/agenda.ts";
import { makeAgendaReader } from "../src/calendar/agenda-reader.ts";
import { projectBusy } from "../src/calendar/availability.ts";
const window = {
  start: Date.parse("2026-03-29T00:00:00+01:00"),
  end: Date.parse("2026-03-30T00:00:00+02:00"),
};
const event = (fields = {}) => ({
  id: "occurrence",
  calendarId: "personal",
  title: "Private appointment",
  location: "Private room",
  notes: "Private notes",
  startDate: "2026-03-29T09:00:00+02:00",
  endDate: "2026-03-29T10:00:00+02:00",
  allDay: false,
  status: "confirmed",
  availability: "busy",
  ...fields,
});
const project = (events, range = window) => projectAgenda(events, ["personal"], range);
const port = (fields = {}) => ({
  permission: async () => true,
  calendars: async () => [{ id: "personal", title: "Personal" }],
  events: async () => [event()],
  ...fields,
});

test("local agenda retains personal display fields without contaminating shared busy projection", () => {
  const events = [event({ url: "private://event", attendees: ["Private attendee"] })];
  const result = project(events);
  assert.equal(result.status, "ready");
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [
    "allDay",
    "calendarId",
    "end",
    "key",
    "location",
    "notes",
    "start",
    "title",
  ]);
  assert.equal(result.rows[0].notes, "Private notes");
  assert.equal(result.rows[0].title, "Private appointment");
  assert.doesNotMatch(
    JSON.stringify(projectBusy(events, ["personal"], window, window.start)),
    /Private|personal|occurrence|private:/,
  );
});

test("free events remain visible locally, cancellations and unselected calendars do not", () => {
  const result = project([
    event({ availability: "free" }),
    event({ id: "cancelled", status: "canceled" }),
    event({ calendarId: "hidden" }),
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].title, "Private appointment");
});

test("EventKit recurring occurrences remain distinct and detached instances are not expanded again", () => {
  const next = event({
    startDate: "2026-03-29T12:00:00+02:00",
    endDate: "2026-03-29T13:00:00+02:00",
    isDetached: true,
    recurrenceRule: { frequency: "daily" },
  });
  const result = project([next, event(), event()]);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows[0].start < result.rows[1].start);
  assert.notEqual(result.rows[0].key, result.rows[1].key);
  assert.deepEqual(project([event(), next]), result);
  assert.equal(
    project([event(), event({ title: "Conflicting same occurrence" })]).reason,
    "invalid_events",
  );
});

test("all-day DST and multi-day bounds remain intact; zero-duration events have half-open membership", () => {
  for (const [startDate, endDate, hours] of [
    ["2026-03-29T00:00:00+01:00", "2026-03-30T00:00:00+02:00", 23],
    ["2026-10-25T00:00:00+02:00", "2026-10-26T00:00:00+01:00", 25],
  ]) {
    const range = { start: Date.parse(startDate), end: Date.parse(endDate) };
    const result = project([event({ startDate, endDate, allDay: true })], range);
    assert.equal(result.rows[0].end - result.rows[0].start, hours * 3600000);
  }
  const result = project([
    event({
      startDate: new Date(window.start - 86400000),
      endDate: new Date(window.end + 86400000),
      allDay: true,
    }),
    event(),
  ]);
  assert.equal(result.rows[0].start, window.start - 86400000);
  assert.equal(result.rows[0].allDay, true);
  for (const [at, count] of [
    [window.start - 1, 0],
    [window.start, 1],
    [window.end - 1, 1],
    [window.end, 0],
  ]) {
    assert.equal(
      project([event({ startDate: new Date(at), endDate: new Date(at) })]).rows.length,
      count,
    );
  }
});

test("optional native text is empty without fabricating details, but malformed dates fail honestly", () => {
  const result = project([event({ title: null, notes: null, location: null })]);
  assert.equal(result.rows[0].title, "");
  assert.equal(result.rows[0].notes, "");
  assert.equal(result.rows[0].location, null);
  for (const startDate of [
    null,
    "2026-03-29",
    "not a date",
    new Date(NaN),
    "2026-03-30T10:00:00Z",
  ]) {
    assert.equal(project([event({ startDate })]).reason, "invalid_events");
  }
});

test("reader checks permission and selected calendar availability again after receiving personal data", async () => {
  for (const state of ["permission", "missing_calendar"]) {
    let completed = false;
    const reader = makeAgendaReader(
      port({
        events: async () => {
          completed = true;
          return [event()];
        },
        permission: async () => !(completed && state === "permission"),
        calendars: async () =>
          completed && state === "missing_calendar" ? [] : [{ id: "personal", title: "Personal" }],
      }),
    );
    assert.deepEqual(await Effect.runPromise(reader.read(["personal"], window)), {
      status: "unavailable",
      reason: state,
    });
  }
});

test("no selection reads no private data; malformed selection and private native failures are sanitized", async () => {
  let reads = 0;
  const reader = makeAgendaReader(
    port({
      events: async () => {
        reads++;
        throw Error("Private upstream text");
      },
    }),
  );
  assert.deepEqual(await Effect.runPromise(reader.read([], window)), { status: "ready", rows: [] });
  assert.equal(reads, 0);
  assert.equal(
    (await Effect.runPromise(reader.read(["personal", "personal"], window))).reason,
    "invalid_events",
  );
  assert.equal(reads, 0);
  assert.deepEqual(await Effect.runPromise(reader.read(["personal"], window)), {
    status: "unavailable",
    reason: "unavailable",
  });
});

test("read captures immutable selected IDs/window and respects Effect cancellation", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const ids = ["personal"],
    range = { ...window },
    abort = new AbortController();
  const reader = makeAgendaReader(
    port({
      events: async (selected, requested) => {
        assert.deepEqual(selected, ["personal"]);
        assert.deepEqual(requested, window);
        await pending;
        return [event()];
      },
    }),
  );
  const work = reader.read(ids, range);
  ids[0] = "hidden";
  range.start = 0;
  const result = Effect.runPromise(work, { signal: abort.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  abort.abort();
  release();
  await assert.rejects(result);
});

test("1000 generated agenda windows preserve exact occurrence bounds and are stable under duplicates/reordering", () => {
  for (let i = 0; i < 1000; i++) {
    const at = window.start + ((i * 7919) % (26 * 3600000)) - 3600000;
    const duration = (i % 4) * 3600000;
    const item = event({
      id: `event-${i}`,
      startDate: new Date(at),
      endDate: new Date(at + duration),
      allDay: i % 3 === 0,
    });
    const expected =
      duration === 0
        ? at >= window.start && at < window.end
        : at < window.end && at + duration > window.start;
    const once = project([item]);
    assert.equal(once.rows.length, Number(expected));
    assert.deepEqual(project([item, item]), once);
    if (expected) {
      assert.equal(once.rows[0].start, at);
      assert.equal(once.rows[0].end, at + duration);
    }
    assert.deepEqual(project([event(), item]), project([item, event()]));
  }
});

test("permission revoked during the final calendar enumeration discards already fetched private rows", async () => {
  let granted = true,
    enumerations = 0;
  const reader = makeAgendaReader(
    port({
      permission: async () => granted,
      calendars: async () => {
        if (++enumerations === 2) granted = false;
        return [{ id: "personal", title: "Personal" }];
      },
    }),
  );
  assert.deepEqual(await Effect.runPromise(reader.read(["personal"], window)), {
    status: "unavailable",
    reason: "permission",
  });
});
