import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import {
  firstRecurringDate,
  nextRecurringDate,
  dueRecurringDates,
} from "../src/money/recurrence.ts";
const monthly = { kind: "monthly", dayOfMonth: 31 },
  weekly = { kind: "weekly", weekday: 1 };
test("audited weekly/monthly examples retain inclusive windows and short-month clamping", () => {
  assert.equal(nextRecurringDate(weekly, "2026-08-11"), "2026-08-17");
  assert.equal(nextRecurringDate(weekly, "2026-08-17"), "2026-08-24");
  assert.equal(nextRecurringDate(monthly, "2026-01-31"), "2026-02-28");
  assert.equal(nextRecurringDate(monthly, "2026-02-28"), "2026-03-31");
  assert.deepEqual(
    dueRecurringDates(weekly, { from: "2026-08-10", through: "2026-08-24", limit: 100 }),
    { dates: ["2026-08-10", "2026-08-17", "2026-08-24"], next: null },
  );
  assert.deepEqual(
    dueRecurringDates(monthly, { from: "2026-01-01", through: "2026-04-30", limit: 100 }).dates,
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  );
});
test("catch-up pages resume at the first unreturned due date without gaps or duplicates", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 31 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 7 }),
      (day, limit, weekday) => {
        for (const schedule of [
          { kind: "monthly", dayOfMonth: day },
          { kind: "weekly", weekday },
        ]) {
          const window = { from: "2024-01-01", through: "2024-12-31", limit: 100 };
          const complete = dueRecurringDates(schedule, window).dates;
          const paged = [];
          let cursor = window.from;
          while (cursor !== null) {
            const page = dueRecurringDates(schedule, { ...window, from: cursor, limit });
            assert.ok(page.dates.length <= limit);
            paged.push(...page.dates);
            cursor = page.next;
          }
          assert.deepEqual(paged, complete);
          assert.equal(new Set(paged).size, paged.length);
        }
      },
    ),
    { seed: 20260921, numRuns: 500 },
  );
});
test("monthly dates across leap centuries and early years match Gregorian month-end arithmetic", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 9998 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 31 }),
      (year, month, day) => {
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
          last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
        const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
        assert.equal(
          firstRecurringDate({ kind: "monthly", dayOfMonth: day }, `${prefix}-01`),
          `${prefix}-${String(Math.min(day, last)).padStart(2, "0")}`,
        );
      },
    ),
    { seed: 20260922, numRuns: 1000 },
  );
  assert.equal(firstRecurringDate(monthly, "0001-02-01"), "0001-02-28");
  assert.equal(firstRecurringDate(monthly, "2000-02-01"), "2000-02-29");
  assert.equal(firstRecurringDate(monthly, "2100-02-01"), "2100-02-28");
});
test("invalid schedules/windows fail and terminal date range does not overflow", () => {
  for (const value of [0, 32, 1.5, NaN, Infinity])
    assert.throws(() => firstRecurringDate({ kind: "monthly", dayOfMonth: value }, "2026-01-01"));
  for (const value of [0, 8, 1.5])
    assert.throws(() => firstRecurringDate({ kind: "weekly", weekday: value }, "2026-01-01"));
  assert.throws(() => firstRecurringDate({ kind: "daily" }, "2026-01-01"));
  for (const date of ["2026-02-29", "0000-01-01", "10000-01-01"])
    assert.throws(() => firstRecurringDate(monthly, date));
  for (const limit of [0, 101, NaN, 1.5])
    assert.throws(() =>
      dueRecurringDates(monthly, { from: "2026-01-01", through: "2026-12-31", limit }),
    );
  assert.equal(nextRecurringDate(monthly, "9999-12-31"), null);
  assert.equal(firstRecurringDate(weekly, "9999-12-31"), null);
  assert.equal(firstRecurringDate(weekly, "0001-01-01"), "0001-01-01");
  assert.equal(firstRecurringDate({ kind: "monthly", dayOfMonth: 1 }, "9999-12-02"), null);
  assert.deepEqual(
    dueRecurringDates(monthly, { from: "9999-12-01", through: "9999-12-31", limit: 1 }),
    { dates: ["9999-12-31"], next: null },
  );
  assert.deepEqual(
    dueRecurringDates(monthly, { from: "2026-02-01", through: "2026-01-01", limit: 1 }),
    { dates: [], next: null },
  );
});
