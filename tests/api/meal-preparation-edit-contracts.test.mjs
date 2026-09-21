import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  EditMealPreparationInput,
  MealPreparationEditReceipt,
} from "../../packages/contracts/src/meal-preparation-edit.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const id = "00000000-0000-4000-8000-000000000001";
const base = {
  entryId: id,
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  routineId: id,
  expectedRoutineVersion: "2030-01-07T12:00:00.123456Z",
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("preparation patches distinguish omitted instructions from explicit null and reject hidden mutations", () => {
  for (const instructions of [null, "", "🍲".repeat(2000)]) {
    const command = { ...base, patch: { instructions } };
    assert.deepEqual(decode(EditMealPreparationInput, command), command);
  }
  const titleOnly = decode(EditMealPreparationInput, { ...base, patch: { title: "Soak" } });
  assert.equal(Object.hasOwn(titleOnly.patch, "instructions"), false);
  for (const patch of [
    {},
    { schedule: { kind: "daily" } },
    { instructions: "\uD800" },
    { instructions: "\u0000" },
    { instructions: "🍲".repeat(2001) },
    { dueOn: "2030-02-30" },
    { assignment: { policy: "shared", memberId: id } },
  ])
    assert.throws(() => decode(EditMealPreparationInput, { ...base, patch }));
});
test("generated preparation edit receipts preserve exact microsecond versions and reject backwards state", () => {
  for (let n = 0; n < 1200; n++) {
    const previousRoutineVersion = `2030-01-07T12:00:00.${String(n).padStart(6, "0")}Z`;
    const routineVersion = `2030-01-07T12:00:00.${String(n + 1).padStart(6, "0")}Z`;
    const value = {
      version: 1,
      actorId: id,
      householdId: id,
      operationId: id,
      entryId: id,
      weekStart: base.weekStart,
      revision: base.expectedRevision,
      routineId: id,
      occurrenceId: id,
      dueOn: "2030-01-06",
      previousRoutineVersion,
      routineVersion,
    };
    assert.deepEqual(decode(MealPreparationEditReceipt, value), value);
    assert.throws(() =>
      decode(MealPreparationEditReceipt, { ...value, routineVersion: previousRoutineVersion }),
    );
    assert.throws(() =>
      decode(MealPreparationEditReceipt, {
        ...value,
        previousRoutineVersion: routineVersion,
        routineVersion: previousRoutineVersion,
      }),
    );
  }
});
