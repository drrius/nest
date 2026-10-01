import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  CreateMealPreparation,
  MealPreparationReceipt,
} from "../../packages/contracts/src/meal-preparation.ts";
import {
  EditMealPreparation,
  MealPreparationEditReceipt,
} from "../../packages/contracts/src/meal-preparation-edit.ts";
import { MealPreparationEnvelope } from "../../packages/contracts/src/meal-preparation-read.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixtures = JSON.parse(
  await readFile(
    new URL("../../apps/ios/Tests/Core/Fixtures/meal-preparation.json", import.meta.url),
    "utf8",
  ),
);

test("Swift preparation wire fixtures match strict Effect schemas, including nullable and omitted edits", () => {
  const cases = {
    create: CreateMealPreparation,
    edit: EditMealPreparation,
    titleOnly: EditMealPreparation,
    createReceipt: MealPreparationReceipt,
    editReceipt: MealPreparationEditReceipt,
    read: MealPreparationEnvelope,
  };
  for (const [name, schema] of Object.entries(cases)) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixtures[name], { onExcessProperty: "error" }),
      fixtures[name],
    );
  }
  assert.equal(Object.hasOwn(fixtures.titleOnly.patch, "instructions"), false);
  assert.equal(fixtures.edit.patch.instructions, null);
  assert.equal(fixtures.create.preparation.instructions, null);
  assert.equal(
    fixtures.editReceipt.routineVersion > fixtures.editReceipt.previousRoutineVersion,
    true,
  );
});
