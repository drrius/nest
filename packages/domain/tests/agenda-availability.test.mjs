import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { assessAgendaAvailability } from "../src/availability.ts";
const sample = {
  covered: { start: 100, end: 1000 },
  intervals: [{ start: 200, end: 400 }],
  capturedAt: 1000,
  expiresAt: 901000,
};
test("partial-day sharing exposes only covered intervals and never labels uncovered time free", () => {
  assert.deepEqual(assessAgendaAvailability(sample, { start: 0, end: 500 }, 1001), {
    status: "known",
    covered: { start: 100, end: 500 },
    complete: false,
    intervals: [{ start: 200, end: 400 }],
    capturedAt: 1000,
    expiresAt: 901000,
  });
  assert.equal(assessAgendaAvailability(sample, { start: 100, end: 1000 }, 1001).complete, true);
  const empty = assessAgendaAvailability(
    { ...sample, intervals: [] },
    { start: 0, end: 500 },
    1001,
  );
  assert.equal(empty.status, "known");
  assert.equal(empty.complete, false);
  assert.deepEqual(empty.intervals, []);
});
test("missing, stale, future, disjoint or invalid coverage remains unknown", () => {
  for (const evidence of [
    null,
    { ...sample, expiresAt: 1001 },
    { ...sample, capturedAt: 1002, expiresAt: 901002 },
  ])
    assert.deepEqual(assessAgendaAvailability(evidence, { start: 0, end: 500 }, 1001), {
      status: "unknown",
    });
  for (const query of [
    { start: 0, end: 100 },
    { start: 1000, end: 2000 },
    { start: 0, end: 2678400001 },
    { start: NaN, end: 500 },
  ])
    assert.deepEqual(assessAgendaAvailability(sample, query, 1001), { status: "unknown" });
});
test("1000 generated partial coverages preserve exact intersections and full-day qualification", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 9999 }),
      fc.integer({ min: 1, max: 10000 }),
      (start, length) => {
        const evidence = {
          ...sample,
          covered: { start, end: start + length },
          intervals: [{ start, end: start + length }],
        };
        const query = { start: 3000, end: 12000 },
          left = Math.max(start, query.start),
          right = Math.min(start + length, query.end);
        const result = assessAgendaAvailability(evidence, query, 1001);
        if (left >= right) assert.deepEqual(result, { status: "unknown" });
        else {
          assert.deepEqual(result.covered, { start: left, end: right });
          assert.deepEqual(result.intervals, [{ start: left, end: right }]);
          assert.equal(result.complete, left === query.start && right === query.end);
        }
        assert.deepEqual(assessAgendaAvailability(evidence, query, 901000), { status: "unknown" });
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
