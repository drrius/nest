import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { projectBusy } from "../src/calendar/availability.ts";

const covered = { start: 0, end: 100 };
const span = fc.tuple(fc.integer({ min: -50, max: 149 }), fc.integer({ min: 1, max: 50 }));
const eventsFor = (spans) =>
  spans.map(([start, length]) => ({
    calendarId: "selected",
    startDate: new Date(start),
    endDate: new Date(start + length),
    availability: "busy",
    status: "confirmed",
    title: "Never shared",
  }));

test("busy union preserves every covered instant, independent of input order and duplicate occurrences", () => {
  fc.assert(
    fc.property(fc.array(span, { maxLength: 30 }), (spans) => {
      const events = eventsFor(spans);
      const snapshot = projectBusy(events, ["selected"], covered, 0);
      assert.equal(snapshot.status, "known");
      assert.deepEqual(projectBusy([...events].reverse(), ["selected"], covered, 0), snapshot);
      assert.deepEqual(projectBusy([...events, ...events], ["selected"], covered, 0), snapshot);
      for (let point = 0; point < 100; point++) {
        const expected = spans.some(([start, length]) => start <= point && point < start + length);
        assert.equal(
          snapshot.intervals.some((range) => range.start <= point && point < range.end),
          expected,
        );
      }
      snapshot.intervals.forEach((range, index) => {
        assert.ok(range.start >= covered.start && range.end <= covered.end);
        assert.ok(range.start < range.end);
        if (index > 0) assert.ok(snapshot.intervals[index - 1].end < range.start);
      });
    }),
    { seed: 20260919, numRuns: 1000 },
  );
});
