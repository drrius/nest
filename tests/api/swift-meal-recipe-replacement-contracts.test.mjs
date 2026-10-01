import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  ReplaceWithRecipe,
  RecipeReplacementReceipt,
  PlannedRecipeEnvelope,
} from "../../packages/contracts/src/recipe-selection.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixtures = JSON.parse(
  await readFile(
    new URL("../../apps/ios/Tests/Core/Fixtures/meal-recipe-replacement.json", import.meta.url),
    "utf8",
  ),
);

test("Swift saved-recipe replacement wire fixtures match strict Effect schemas", () => {
  for (const [key, schema] of Object.entries({
    command: ReplaceWithRecipe,
    receipt: RecipeReplacementReceipt,
    retained: PlannedRecipeEnvelope,
  })) {
    assert.deepEqual(
      Schema.decodeUnknownSync(schema)(fixtures[key], { onExcessProperty: "error" }),
      fixtures[key],
    );
  }
  assert.throws(() =>
    Schema.decodeUnknownSync(ReplaceWithRecipe)({
      ...fixtures.command,
      expectedRevision: "9223372036854775806",
    }),
  );
  assert.throws(() =>
    Schema.decodeUnknownSync(RecipeReplacementReceipt)({
      ...fixtures.receipt,
      entryId: fixtures.receipt.previousEntryId,
    }),
  );
});
