import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { recurringCycle, firstUncoveredRecurringCycle } from "../src/money/recurring-cycle.ts";
import { firstRecurringDate, nextRecurringDate } from "../src/money/recurrence.ts";

const monthly = { kind: "monthly", dayOfMonth: 31 };
const weekly = { kind: "weekly", weekday: 1 };
const schedule = fc.oneof(
  fc.integer({ min: 1, max: 31 }).map((dayOfMonth) => ({ kind: "monthly", dayOfMonth })),
  fc.integer({ min: 1, max: 7 }).map((weekday) => ({ kind: "weekly", weekday })),
);
const date = fc
  .tuple(fc.integer({ min: 1, max: 9998 }), fc.integer({ min: 1, max: 12 }))
  .map(([year, month]) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`);

test("due-day edits preserve the identity of the covered month or ISO week", () => {
  fc.assert(
    fc.property(date, schedule, (from, plan) => {
      const due = firstRecurringDate(plan, from);
      const original = recurringCycle(plan, due);
      const count = plan.kind === "monthly" ? 31 : 7;
      for (let day = 1; day <= count; day++) {
        const edit =
          plan.kind === "monthly"
            ? { kind: "monthly", dayOfMonth: day }
            : { kind: "weekly", weekday: day };
        const moved = recurringCycle(edit, firstRecurringDate(edit, original.startsOn));
        assert.equal(moved.key, original.key);
        assert.equal(moved.startsOn, original.startsOn);
        assert.equal(moved.through, original.through);
      }
    }),
    { seed: 20260923, numRuns: 500 },
  );
});

test("cadence changes skip overlapping coverage and expose the first eligible due date", () => {
  assert.equal(
    firstUncoveredRecurringCycle(weekly, {
      from: "2026-01-20",
      coveredThrough: "2026-01-31",
    }).dueOn,
    "2026-02-02",
  );
  assert.equal(
    firstUncoveredRecurringCycle(monthly, {
      from: "2026-02-02",
      coveredThrough: "2026-02-08",
    }).dueOn,
    "2026-03-31",
  );
  assert.equal(
    firstUncoveredRecurringCycle(
      { kind: "monthly", dayOfMonth: 20 },
      {
        from: "2026-01-15",
        coveredThrough: "2026-01-31",
      },
    ).dueOn,
    "2026-02-20",
  );
  assert.equal(
    firstUncoveredRecurringCycle(monthly, {
      from: "2026-01-15",
      coveredThrough: null,
    }).dueOn,
    "2026-01-31",
  );
});

test("edited schedules never reuse a consumed period and do not skip an eligible due date", () => {
  fc.assert(
    fc.property(date, schedule, schedule, (from, original, edit) => {
      const consumed = recurringCycle(original, firstRecurringDate(original, from));
      const next = firstUncoveredRecurringCycle(edit, { from, coveredThrough: consumed.through });
      assert.ok(next.startsOn > consumed.through);
      assert.ok(next.dueOn >= from);
      // Independent bounded enumeration establishes earliest eligibility, not just non-overlap.
      let due = firstRecurringDate(edit, from);
      while (recurringCycle(edit, due).startsOn <= consumed.through)
        due = nextRecurringDate(edit, due);
      assert.equal(next.dueOn, due);
      assert.deepEqual(
        firstUncoveredRecurringCycle(edit, {
          from: next.dueOn,
          coveredThrough: consumed.through,
        }),
        next,
      );
    }),
    { seed: 20260924, numRuns: 1500 },
  );
});

test("boundary periods remain representable and invalid input cannot invent a cycle", () => {
  assert.equal(
    firstUncoveredRecurringCycle(monthly, {
      from: "2026-09-15",
      coveredThrough: "2026-01-31",
    }).dueOn,
    "2026-09-30",
  );
  assert.deepEqual(recurringCycle(weekly, "0001-01-01"), {
    key: "weekly:0001-01-01",
    dueOn: "0001-01-01",
    startsOn: "0001-01-01",
    through: "0001-01-07",
  });
  assert.equal(recurringCycle({ kind: "weekly", weekday: 5 }, "9999-12-31").through, "9999-12-31");
  assert.equal(
    firstUncoveredRecurringCycle(monthly, {
      from: "9999-12-01",
      coveredThrough: "9999-12-01",
    }),
    null,
  );
  assert.equal(
    firstUncoveredRecurringCycle(weekly, {
      from: "0001-01-01",
      coveredThrough: "9999-12-31",
    }),
    null,
  );
  assert.throws(() => recurringCycle(monthly, "2026-01-15"));
  assert.throws(() =>
    firstUncoveredRecurringCycle(
      { kind: "daily" },
      {
        from: "2026-01-01",
        coveredThrough: "9999-12-31",
      },
    ),
  );
  assert.throws(() =>
    firstUncoveredRecurringCycle(weekly, {
      from: "2026-01-01",
      coveredThrough: "2026-02-30",
    }),
  );
});
