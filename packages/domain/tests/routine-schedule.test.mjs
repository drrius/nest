import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { asIsoDate, firstDueDateOnOrAfter, nextDueAfterClosure } from "../src/routines/index.ts";
const day = (offset) =>
  new Date(Date.UTC(2000, 0, 1) + offset * 86400000).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const next = (rule, closedDueDate, extras = {}) =>
  nextDueAfterClosure({ rule, closedDueDate, ...extras });

test("civil dates retain early years and reject normalization and overflow", () => {
  for (const date of ["0001-01-01", "0099-12-31", "0004-02-29", "0400-02-29"])
    assert.equal(asIsoDate(date), date);
  for (const date of ["0000-01-01", "0100-02-29", "2026-02-30", "2026-01-01\n", "10000-01-01"])
    assert.throws(() => asIsoDate(date));
  assert.equal(next({ kind: "daily" }, asIsoDate("0099-12-31")), "0100-01-01");
  assert.equal(next({ kind: "monthly", dayOfMonth: 31 }, asIsoDate("0004-01-31")), "0004-02-29");
  assert.throws(() => next({ kind: "daily" }, asIsoDate("9999-12-31")));
});

test("monthly clamping, biweekly original phase, completion and skip anchors remain distinct", () => {
  assert.equal(next({ kind: "monthly", dayOfMonth: 31 }, "2024-01-31"), "2024-02-29");
  assert.equal(next({ kind: "monthly", dayOfMonth: 31 }, "2024-02-29"), "2024-03-31");
  assert.equal(
    next({ kind: "biweekly", weekday: 1 }, "2026-09-25", { originalDueDate: "2026-09-07" }),
    "2026-09-21",
  );
  const rule = { kind: "after_completion", every: 2, unit: "weeks" };
  assert.equal(next(rule, "2026-09-01", { completedOn: "2026-09-20" }), "2026-10-04");
  assert.equal(next(rule, "2026-09-01"), "2026-09-15");
  assert.equal(next({ kind: "one_off", date: "2026-09-01" }, "2026-09-01"), null);
  assert.equal(
    firstDueDateOnOrAfter({ kind: "one_off", date: "2026-09-01" }, "2026-09-20"),
    "2026-09-01",
  );
});

test("generated weekly and selected weekdays choose the earliest eligible successor", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 36000 }),
      fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1 }),
      (offset, days) => {
        const from = day(offset);
        let delta = 1;
        while (!days.includes(weekday(day(offset + delta)))) delta++;
        assert.equal(next({ kind: "weekdays", days }, from), day(offset + delta));
        const weekly = next({ kind: "weekly", weekday: days[0] }, from);
        assert.equal(weekday(weekly), days[0]);
        assert.ok(weekly > from && weekly <= day(offset + 7));
        const biweekly = next({ kind: "biweekly", weekday: days[0] }, from);
        assert.equal(weekday(biweekly), days[0]);
        assert.ok(biweekly >= day(offset + 8) && biweekly <= day(offset + 14));
        if (weekday(from) === days[0]) assert.equal(biweekly, day(offset + 14));
      },
    ),
    { seed: 20260920, numRuns: 1000 },
  );
});

test("completion intervals depend on actual completion, independent of prior due date", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 36000 }),
      fc.integer({ min: 1, max: 365 }),
      fc.boolean(),
      (offset, every, weeks) => {
        const rule = { kind: "after_completion", every, unit: weeks ? "weeks" : "days" };
        const expected = day(offset + every * (weeks ? 7 : 1));
        for (const due of ["0001-01-01", "2026-09-20", "9999-12-31"])
          assert.equal(next(rule, due, { completedOn: day(offset) }), expected);
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
