import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  MoveMeal,
  MoveMealInput,
  MealMoveReceipt,
} from "../../packages/contracts/src/meal-move.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  entryId: id(1),
  sourceWeekStart: "2026-10-05",
  targetWeekStart: "2026-10-12",
  expectedSourceRevision: "9007199254740993",
  expectedTargetRevision: "0",
  date: "2026-10-18",
  slot: "dinner",
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("move contracts retain exact cross-week revisions and reject inconsistent or hidden baselines", () => {
  assert.deepEqual(decode(MoveMealInput, input), input);
  assert.deepEqual(decode(MoveMeal, { ...input, operationId: id(2) }), {
    ...input,
    operationId: id(2),
  });
  for (const patch of [
    { actorId: id(3) },
    { date: "2026-10-19" },
    { date: "2026-02-30" },
    { targetWeekStart: "2026-10-13" },
    { expectedTargetRevision: 0 },
    { expectedSourceRevision: "9223372036854775808" },
    { targetWeekStart: input.sourceWeekStart, date: "2026-10-06" },
  ])
    assert.throws(() => decode(MoveMealInput, { ...input, ...patch }));
  const same = {
    ...input,
    targetWeekStart: input.sourceWeekStart,
    date: "2026-10-06",
    expectedTargetRevision: input.expectedSourceRevision,
  };
  assert.deepEqual(decode(MoveMealInput, same), same);
});
test("destination contract covers every civil day including leap years and representable endpoints", () => {
  for (const week of ["0001-01-01", "2000-02-28", "2024-02-26", "2026-12-28", "9999-12-20"]) {
    const start = Date.parse(`${week}T00:00:00Z`);
    for (let offset = -1; offset <= 7; offset++) {
      const date = new Date(start + offset * 86400000).toISOString().slice(0, 10);
      const value = { ...input, targetWeekStart: week, date };
      if (offset >= 0 && offset <= 6) assert.deepEqual(decode(MoveMealInput, value), value);
      else assert.throws(() => decode(MoveMealInput, value));
    }
  }
});
test("move receipts require positive revisions and one consistent same-week result", () => {
  const receipt = {
    version: 1,
    actorId: id(3),
    householdId: id(4),
    operationId: id(2),
    entryId: id(1),
    sourceWeekStart: input.sourceWeekStart,
    targetWeekStart: input.targetWeekStart,
    sourceRevision: "9007199254740994",
    targetRevision: "1",
    date: input.date,
    slot: input.slot,
  };
  assert.deepEqual(decode(MealMoveReceipt, receipt), receipt);
  for (const patch of [
    { sourceRevision: "0" },
    { targetRevision: "0" },
    { date: "2026-10-19" },
    { targetWeekStart: input.sourceWeekStart, date: "2026-10-06" },
  ])
    assert.throws(() => decode(MealMoveReceipt, { ...receipt, ...patch }));
});
