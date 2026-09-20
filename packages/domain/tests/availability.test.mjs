import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { assessAvailability } from "../src/availability.ts";
const sample = {
  covered: { start: 100, end: 1000 },
  intervals: [{ start: 200, end: 400 }],
  capturedAt: 1000,
  expiresAt: 901000,
};
test("unknown, stale, future or out-of-coverage evidence never establishes free time", () => {
  for (const evidence of [
    null,
    { ...sample, capturedAt: 1002, expiresAt: 901002 },
    { ...sample, expiresAt: 1001 },
    { ...sample, expiresAt: 901001 },
    { ...sample, intervals: [{ start: 50, end: 200 }] },
  ])
    assert.deepEqual(assessAvailability(evidence, { start: 500, end: 600 }, 1001), {
      status: "unknown",
    });
  assert.deepEqual(assessAvailability(sample, { start: 99, end: 101 }, 1001), {
    status: "unknown",
  });
  assert.deepEqual(assessAvailability(sample, { start: 100, end: 1001 }, 1001), {
    status: "unknown",
  });
  assert.deepEqual(assessAvailability(sample, { start: 100, end: 200 }, NaN), {
    status: "unknown",
  });
});
test("availability clips intervals to the query and treats touching boundaries as nonoverlapping", () => {
  assert.deepEqual(assessAvailability(sample, { start: 300, end: 500 }, 1001), {
    status: "busy",
    intervals: [{ start: 300, end: 400 }],
    capturedAt: 1000,
    expiresAt: 901000,
  });
  assert.equal(assessAvailability(sample, { start: 400, end: 500 }, 1001).status, "free");
  assert.equal(assessAvailability(sample, { start: 100, end: 200 }, 1001).status, "free");
});
test("generated interval queries agree with exact overlap, clipping and expiry invariants", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 10000 })), {
        maxLength: 30,
      }),
      fc.tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 10000 })),
      (pairs, queryPair) => {
        const intervals = pairs
          .map(([a, b]) => ({ start: Math.min(a, b), end: Math.max(a, b) }))
          .filter((x) => x.start < x.end);
        const query = { start: Math.min(...queryPair), end: Math.max(...queryPair) };
        if (query.start === query.end) return;
        const evidence = {
          covered: { start: 0, end: 10000 },
          intervals,
          capturedAt: 1000,
          expiresAt: 901000,
        };
        const result = assessAvailability(evidence, query, 1001);
        const overlaps = intervals.filter((x) => x.start < query.end && x.end > query.start);
        assert.equal(result.status, overlaps.length ? "busy" : "free");
        assert.deepEqual(
          result.intervals,
          overlaps.map((x) => ({
            start: Math.max(x.start, query.start),
            end: Math.min(x.end, query.end),
          })),
        );
        assert.deepEqual(assessAvailability(evidence, query, 901000), { status: "unknown" });
      },
    ),
    { seed: 20260920, numRuns: 1000 },
  );
});
