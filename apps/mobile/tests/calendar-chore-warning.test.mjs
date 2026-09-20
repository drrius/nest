import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import * as Effect from "effect/Effect";
import { choreDayWindow, choreCalendarWarning } from "../src/calendar/chore-warning.ts";
import { makeCalendarReader } from "../src/calendar/service.ts";
import { householdDate } from "@nest/domain/calendar";
test("Zurich chore dates cover exactly their civil day, including DST and supported year boundaries", () => {
  for (const date of [
    "0001-01-01",
    "9999-12-31",
    "2026-03-29",
    "2026-10-25",
    ...Array.from({ length: 365 }, (_, i) =>
      new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    ),
  ]) {
    const window = choreDayWindow(date);
    const day = (time) => householdDate(new Date(time)).padStart(10, "0");
    assert.equal(day(window.start), date);
    assert.equal(day(window.end - 1), date);
    assert.notEqual(day(window.start - 1), date);
    assert.notEqual(day(window.end), date);
  }
  assert.equal(choreDayWindow("2026-03-29").end - choreDayWindow("2026-03-29").start, 23 * 3600000);
  assert.equal(choreDayWindow("2026-10-25").end - choreDayWindow("2026-10-25").start, 25 * 3600000);
  for (const date of ["2026-02-30", "0000-01-01", "10000-01-01", "2026-09-20T00:00:00Z"])
    assert.equal(choreDayWindow(date), null);
});
test("local calendar warning distinguishes busy, free and unknown without requesting permissions or transmitting metadata", async () => {
  let permission = true,
    events = [],
    captures = 0;
  const reader = makeCalendarReader({
    permission: async () => permission,
    requestPermission: () => assert.fail("unsolicited permission"),
    calendars: async () => [{ id: "private", title: "Never sent" }],
    events: async (ids, window) => {
      captures++;
      assert.deepEqual(ids, ["private"]);
      assert.deepEqual(window, choreDayWindow("2026-03-29"));
      return events;
    },
  });
  const read = (ids) => Effect.runPromise(choreCalendarWarning(reader, ids, "2026-03-29", 100));
  assert.equal(await read([]), "unknown");
  assert.equal(captures, 0);
  assert.equal(await read(["private"]), "free");
  events = [
    {
      calendarId: "private",
      startDate: "2026-03-29T10:00:00+02:00",
      endDate: "2026-03-29T11:00:00+02:00",
    },
  ];
  assert.equal(await read(["private"]), "busy");
  events[0].availability = "free";
  assert.equal(await read(["private"]), "free");
  permission = false;
  assert.equal(await read(["private"]), "unknown");
});

test("every generated supported Zurich date has a contiguous civil-day window", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 9999 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 }),
      (year, month, day) => {
        const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const window = choreDayWindow(date);
        assert.ok(window.end > window.start);
        assert.equal(householdDate(new Date(window.start)).padStart(10, "0"), date);
        assert.equal(householdDate(new Date(window.end - 1)).padStart(10, "0"), date);
        assert.notEqual(householdDate(new Date(window.end)).padStart(10, "0"), date);
      },
    ),
    { seed: 20260920, numRuns: 1000 },
  );
});
