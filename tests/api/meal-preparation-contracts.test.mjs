import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  CreateMealPreparationInput,
  CreateMealPreparation,
  MealPreparationReceipt,
} from "../../packages/contracts/src/meal-preparation.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  entryId: id(30),
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  preparation: {
    title: "Soak beans",
    instructions: null,
    dueOn: "2030-01-06",
    assignment: { policy: "shared" },
  },
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("preparation shares exact meal baselines without granting model retry identities", () => {
  assert.deepEqual(decode(CreateMealPreparationInput, input), input);
  const command = { ...input, operationId: id(20) };
  assert.deepEqual(decode(CreateMealPreparation, command), command);
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(20) },
    { householdId: id(10) },
    { expectedRevision: 1 },
    { expectedRevision: "-1" },
    { weekStart: "2030-01-08" },
  ])
    assert.throws(() => decode(CreateMealPreparationInput, { ...input, ...patch }));
  assert.throws(() => decode(CreateMealPreparation, input));
});
test("preparation rejects malformed instructions, dates and assignment injections", () => {
  for (const patch of [
    { title: " " },
    { title: "x".repeat(121) },
    { instructions: "x".repeat(4001) },
    { instructions: "\u0000" },
    { instructions: "\uD800" },
    { dueOn: "2030-02-29" },
    { assignment: { policy: "shared", memberId: id(2) } },
    { assignment: { policy: "assigned" } },
    { schedule: { kind: "daily" } },
  ])
    assert.throws(() =>
      decode(CreateMealPreparationInput, {
        ...input,
        preparation: { ...input.preparation, ...patch },
      }),
    );
  for (const instructions of [null, "", "🍲 Soak overnight", "x".repeat(4000)])
    assert.equal(
      decode(CreateMealPreparationInput, {
        ...input,
        preparation: { ...input.preparation, instructions },
      }).preparation.instructions,
      instructions,
    );
});
test("generated preparation dates and receipt microseconds survive exact decoding", () => {
  const base = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    entryId: id(30),
    weekStart: input.weekStart,
    revision: input.expectedRevision,
    routineId: id(40),
    occurrenceId: id(41),
  };
  for (let n = 0; n < 1200; n++) {
    const date = new Date(Date.UTC(2000, 0, 1 + n)).toISOString().slice(0, 10);
    const routineVersion = `2030-01-07T12:00:00.${String(n).padStart(6, "0")}Z`;
    const receipt = { ...base, dueOn: date, routineVersion };
    assert.deepEqual(decode(MealPreparationReceipt, receipt), receipt);
    assert.equal(
      decode(CreateMealPreparationInput, {
        ...input,
        preparation: { ...input.preparation, dueOn: date },
      }).preparation.dueOn,
      date,
    );
  }
  assert.throws(() =>
    decode(MealPreparationReceipt, {
      ...base,
      dueOn: "2030-01-07",
      routineVersion: "2030-01-07T12:00:00.123Z",
    }),
  );
});
