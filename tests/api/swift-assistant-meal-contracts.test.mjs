import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PlaceMeal, MealPlacementReceipt } from "../../packages/contracts/src/meal-placement.ts";
import { RemoveMeal, MealRemovalReceipt } from "../../packages/contracts/src/meal-removal.ts";
import {
  ReplaceMeal,
  MealReplacementReceipt,
} from "../../packages/contracts/src/meal-replacement.ts";
import { MoveMeal, MealMoveReceipt } from "../../packages/contracts/src/meal-move.ts";
import {
  PlaceLeftovers,
  LeftoverPlacementReceipt,
} from "../../packages/contracts/src/meal-leftovers.ts";
import {
  PlaceRecipe,
  RecipePlacementReceipt,
} from "../../packages/contracts/src/recipe-selection.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixtures = JSON.parse(
  await readFile(
    new URL("../../apps/ios/Tests/Core/Fixtures/assistant-meal-actions.json", import.meta.url),
    "utf8",
  ),
);
const schemas = {
  "tool-placeMeal": [PlaceMeal, MealPlacementReceipt],
  "tool-placeRecipe": [PlaceRecipe, RecipePlacementReceipt],
  "tool-replaceMeal": [ReplaceMeal, MealReplacementReceipt],
  "tool-removeMeal": [RemoveMeal, MealRemovalReceipt],
  "tool-moveMeal": [MoveMeal, MealMoveReceipt],
  "tool-placeLeftovers": [PlaceLeftovers, LeftoverPlacementReceipt],
};
test("Swift assistant meal action fixtures match actual strict Effect commands and receipts", () => {
  for (const fixture of fixtures) {
    const [command, receipt] = schemas[fixture.type];
    const input = { ...fixture.input, operationId: fixture.receipt.operationId };
    assert.deepEqual(
      Schema.decodeUnknownSync(command)(input, { onExcessProperty: "error" }),
      input,
    );
    assert.deepEqual(
      Schema.decodeUnknownSync(receipt)(fixture.receipt, { onExcessProperty: "error" }),
      fixture.receipt,
    );
  }
});
