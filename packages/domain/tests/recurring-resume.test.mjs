import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { planRecurringResume } from "../src/money/recurring-resume.ts";
const date = fc
  .integer({ min: 0, max: 10000 })
  .map((day) => new Date(Date.UTC(2000, 0, 1 + day)).toISOString().slice(0, 10));
const schedule = fc.oneof(
  fc.record({ kind: fc.constant("weekly"), weekday: fc.integer({ min: 1, max: 7 }) }),
  fc.record({ kind: fc.constant("monthly"), dayOfMonth: fc.integer({ min: 1, max: 31 }) }),
);
test("resumption never precedes the current date, original start or previously consumed period", () => {
  fc.assert(
    fc.property(
      schedule,
      date,
      date,
      fc.option(date, { nil: null }),
      (schedule, today, startDate, coveredThrough) => {
        const result = planRecurringResume(schedule, { today, startDate, coveredThrough });
        assert.ok(result);
        assert.equal(result.resumeFrom, today > startDate ? today : startDate);
        assert.ok(result.cycle.dueOn >= today && result.cycle.dueOn >= startDate);
        if (coveredThrough !== null) assert.ok(result.cycle.startsOn > coveredThrough);
      },
    ),
    { numRuns: 1000 },
  );
  assert.equal(
    planRecurringResume(
      { kind: "monthly", dayOfMonth: 31 },
      { today: "9999-12-31", startDate: "0001-01-01", coveredThrough: "9999-12-31" },
    ),
    null,
  );
  assert.throws(() =>
    planRecurringResume(
      { kind: "weekly", weekday: 0 },
      { today: "2026-01-01", startDate: "2026-01-01", coveredThrough: null },
    ),
  );
});
