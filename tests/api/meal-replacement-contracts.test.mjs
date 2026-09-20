import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  ReplaceMealInput,
  ReplaceMeal,
  MealReplacementReceipt,
} from "../../packages/contracts/src/meal-replacement.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  entryId: id(1),
  weekStart: "2026-10-05",
  expectedRevision: "9007199254740993",
  date: "2026-10-06",
  slot: "dinner",
  title: "Lentil soup",
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("replacement shares placement boundaries, retains exact revisions and reserves capacity for both mutations", () => {
  assert.deepEqual(decode(ReplaceMealInput, input), input);
  assert.deepEqual(decode(ReplaceMeal, { ...input, operationId: id(2) }), {
    ...input,
    operationId: id(2),
  });
  for (const patch of [
    { actorId: id(3) },
    { date: "2026-10-12" },
    { expectedRevision: "9223372036854775806" },
    { entryId: "bad" },
    { title: " " },
    { title: "\uD800" },
    { expectedRevision: 1 },
  ])
    assert.throws(() => decode(ReplaceMealInput, { ...input, ...patch }));
  assert.equal(
    decode(ReplaceMealInput, { ...input, expectedRevision: "9223372036854775805" })
      .expectedRevision,
    "9223372036854775805",
  );
});
test("replacement receipt identifies separate retained and new entries with a two-change week revision", () => {
  const value = {
    version: 1,
    actorId: id(3),
    householdId: id(4),
    operationId: id(2),
    previousEntryId: input.entryId,
    entryId: id(5),
    weekStart: input.weekStart,
    date: input.date,
    slot: input.slot,
    revision: "9007199254740995",
    skippedPreparationId: null,
  };
  assert.deepEqual(decode(MealReplacementReceipt, value), value);
  for (const patch of [
    { entryId: input.entryId },
    { revision: "1" },
    { date: "2026-10-12" },
    { skippedPreparationId: "bad" },
    { hidden: true },
  ])
    assert.throws(() => decode(MealReplacementReceipt, { ...value, ...patch }));
});
