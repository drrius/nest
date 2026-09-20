import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { mealWeek, adjacentMealWeek } from "../src/meal-week.ts";

test("civil meal weeks cover DST, leap days, year changes and years before 100", () => {
  for (const [date, monday, sunday] of [
    ["2026-03-29", "2026-03-23", "2026-03-29"],
    ["2026-10-25", "2026-10-19", "2026-10-25"],
    ["2024-02-29", "2024-02-26", "2024-03-03"],
    ["2027-01-01", "2026-12-28", "2027-01-03"],
    ["0001-01-01", "0001-01-01", "0001-01-07"],
    ["0099-12-31", "0099-12-28", "0100-01-03"],
  ]) {
    const week = mealWeek(date);
    assert.equal(week[0], monday);
    assert.equal(week[6], sunday);
    assert.ok(week.includes(date));
  }
});

test("generated days belong to one complete week and navigation is reversible", () => {
  fc.assert(
    fc.property(fc.integer({ min: 7, max: 3652046 }), (day) => {
      const instant = new Date("0001-01-01T00:00:00.000Z");
      instant.setUTCDate(instant.getUTCDate() + day);
      const date = instant.toISOString().slice(0, 10);
      const week = mealWeek(date);
      assert.equal(week.length, 7);
      assert.equal(new Set(week).size, 7);
      assert.ok(week.includes(date));
      assert.equal(new Date(`${week[0]}T00:00:00Z`).getUTCDay(), 1);
      for (const member of week) assert.deepEqual(mealWeek(member), week);
      const previous = adjacentMealWeek(week[0], -1);
      assert.deepEqual(adjacentMealWeek(previous[0], 1), week);
    }),
    { numRuns: 1000 },
  );
});

test("invalid dates and incomplete boundary weeks fail rather than wrap", () => {
  for (const date of ["2026-02-29", "0000-01-01", "2026-1-1", "2026-01-01\n", "9999-12-31"]) {
    assert.throws(() => mealWeek(date));
  }
  assert.throws(() => adjacentMealWeek("0001-01-01", -1));
  assert.throws(() => adjacentMealWeek("9999-12-20", 1));
  assert.throws(() => adjacentMealWeek("2026-09-22", 1));
  assert.throws(() => adjacentMealWeek("2026-09-21", 0));
  assert.equal(mealWeek("9999-12-26")[6], "9999-12-26");
});
