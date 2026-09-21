import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  AddMealIngredients,
  MealIngredientPage,
  MealIngredientsReceipt,
  IngredientQuantity,
} from "../../packages/contracts/src/meal-ingredients.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = { entryId: id(1), ingredientId: id(100), quantity: "½", unit: "cup" };
const command = {
  operationId: id(800),
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  selected: [source],
};
const row = {
  ...source,
  mealTitle: "Soup",
  date: command.weekStart,
  slot: "dinner",
  name: "Beans",
  categoryId: null,
  groceryItemId: null,
};
const page = {
  version: 1,
  householdId: id(10),
  weekStart: command.weekStart,
  revision: command.expectedRevision,
  ingredients: [row],
  skipped: [],
  nextAfter: null,
};
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("ingredient selection retains exact Unicode quantities and source identity without client recipe authority", () => {
  assert.deepEqual(decode(AddMealIngredients, command), command);
  assert.equal(decode(IngredientQuantity, "🥕".repeat(80)), "🥕".repeat(80));
  assert.equal(decode(IngredientQuantity, null), null);
  for (const quantity of ["🥕".repeat(81), "\u0000", "\ud800"])
    assert.throws(() => decode(IngredientQuantity, quantity));
  for (const patch of [{ actorId: id(2) }, { approved: true }])
    assert.throws(() => decode(AddMealIngredients, { ...command, ...patch }));
  for (const patch of [{ name: "Forged" }, { categoryId: id(20) }, { recipe: {} }])
    assert.throws(() =>
      decode(AddMealIngredients, { ...command, selected: [{ ...source, ...patch }] }),
    );
  assert.throws(() => decode(AddMealIngredients, { ...command, selected: [] }));
  assert.throws(() =>
    decode(AddMealIngredients, { ...command, selected: [source, { ...source, quantity: "2" }] }),
  );
  assert.throws(() => decode(AddMealIngredients, { ...command, weekStart: "2030-01-08" }));
});
test("ingredient pages bind a complete ordered bounded cursor and reject skipped or out-of-week sources", () => {
  assert.deepEqual(decode(MealIngredientPage, page), page);
  assert.throws(() =>
    decode(MealIngredientPage, {
      ...page,
      nextAfter: { entryId: source.entryId, ingredientId: source.ingredientId },
    }),
  );
  assert.throws(() => decode(MealIngredientPage, { ...page, ingredients: [row, row] }));
  assert.throws(() =>
    decode(MealIngredientPage, { ...page, ingredients: [{ ...row, date: "2030-01-14" }] }),
  );
  assert.throws(() =>
    decode(MealIngredientPage, {
      ...page,
      skipped: [{ entryId: row.entryId, reason: "leftovers" }],
    }),
  );
  const ingredients = Array.from({ length: 100 }, (_, n) => ({
    ...row,
    ingredientId: id(n + 100),
  }));
  const nextAfter = { entryId: row.entryId, ingredientId: id(199) };
  assert.equal(
    decode(MealIngredientPage, { ...page, ingredients, nextAfter }).ingredients.length,
    100,
  );
  assert.throws(() =>
    decode(MealIngredientPage, {
      ...page,
      ingredients,
      nextAfter: { ...nextAfter, ingredientId: id(198) },
    }),
  );
});
test("addition receipts distinguish each selected source and never claim a shared merged grocery ID", () => {
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: command.operationId,
    weekStart: command.weekStart,
    weekRevision: command.expectedRevision,
    ingredients: [{ entryId: id(1), ingredientId: id(100), itemId: id(900), outcome: "added" }],
  };
  assert.deepEqual(decode(MealIngredientsReceipt, receipt), receipt);
  assert.throws(() =>
    decode(MealIngredientsReceipt, {
      ...receipt,
      ingredients: [...receipt.ingredients, { ...receipt.ingredients[0], ingredientId: id(101) }],
    }),
  );
  assert.throws(() =>
    decode(MealIngredientsReceipt, {
      ...receipt,
      ingredients: [{ ...receipt.ingredients[0], outcome: "merged" }],
    }),
  );
});

test("reviewed Unicode ingredients remain readable and editable through the existing grocery contract", async () => {
  const { Grocery, EditGrocery } = await import("../../packages/contracts/src/groceries.ts");
  const item = {
    itemId: id(900),
    name: "🥕".repeat(120),
    quantity: "½".repeat(80),
    unit: "🥕".repeat(80),
    categoryId: null,
    version: "1",
    checked: false,
    legacyClaimed: false,
  };
  assert.deepEqual(decode(Grocery, item), item);
  const { version, checked: _checked, legacyClaimed: _legacyClaimed, ...fields } = item;
  assert.deepEqual(
    decode(EditGrocery, { operationId: id(901), expectedVersion: version, ...fields }).unit,
    item.unit,
  );
  assert.throws(() =>
    decode(EditGrocery, {
      operationId: id(901),
      expectedVersion: version,
      ...fields,
      name: "🥕".repeat(121),
    }),
  );
});
