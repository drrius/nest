import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  MealLibraryPage,
  ReadMealLibrary,
  SavedMealEnvelope,
} from "../../packages/contracts/src/meal-library.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const summary = (n) => ({ definitionId: id(n), title: "Soup", servings: null });
const page = {
  version: 1,
  householdId: id(10),
  revision: "9007199254740993",
  meals: [summary(20), summary(21)],
  nextAfterId: null,
};
const ingredient = (n, order = 0) => ({
  ingredientId: id(n),
  name: "Tomatoes",
  quantity: "1/2",
  unit: "cup",
  categoryId: null,
  note: null,
  order,
});
const detail = {
  version: 1,
  householdId: id(10),
  revision: "9007199254740993",
  recipe: {
    ...summary(20),
    recipeUrl: null,
    notes: "Legacy notes",
    instructions: null,
    ingredients: [ingredient(30), ingredient(31)],
  },
};

test("library read contracts reject incomplete continuation baselines and inconsistent pagination", () => {
  assert.deepEqual(decode(MealLibraryPage, page), page);
  assert.deepEqual(decode(ReadMealLibrary, { afterId: null, expectedRevision: null }), {
    afterId: null,
    expectedRevision: null,
  });
  assert.throws(() => decode(ReadMealLibrary, { afterId: id(20), expectedRevision: null }));
  assert.throws(() => decode(ReadMealLibrary, { afterId: null, expectedRevision: "01" }));
  assert.throws(() =>
    decode(ReadMealLibrary, { afterId: null, expectedRevision: null, householdId: id(20) }),
  );
  assert.throws(() => decode(MealLibraryPage, { ...page, nextAfterId: id(21) }));
  assert.throws(() => decode(MealLibraryPage, { ...page, meals: [...page.meals].reverse() }));
  assert.throws(() => decode(MealLibraryPage, { ...page, meals: [summary(20), summary(20)] }));
  const full = {
    ...page,
    meals: Array.from({ length: 50 }, (_, n) => summary(n + 100)),
    nextAfterId: id(149),
  };
  assert.deepEqual(decode(MealLibraryPage, full), full);
  assert.throws(() => decode(MealLibraryPage, { ...full, nextAfterId: id(148) }));
});

test("recipe contracts retain legacy unknowns and exact ingredient text, rejecting reordered or duplicate ingredients", () => {
  assert.deepEqual(decode(SavedMealEnvelope, detail), detail);
  assert.deepEqual(decode(SavedMealEnvelope, { ...detail, recipe: null }).recipe, null);
  for (const ingredients of [
    [ingredient(30), ingredient(30)],
    [ingredient(31), ingredient(30)],
    [ingredient(30, 1), ingredient(31, 0)],
  ]) {
    assert.throws(() =>
      decode(SavedMealEnvelope, { ...detail, recipe: { ...detail.recipe, ingredients } }),
    );
  }
  for (const servings of [0, -1, 1.5, 2147483648, "2"]) {
    assert.throws(() =>
      decode(SavedMealEnvelope, { ...detail, recipe: { ...detail.recipe, servings } }),
    );
  }
  assert.equal(
    decode(SavedMealEnvelope, {
      ...detail,
      recipe: { ...detail.recipe, servings: 2, instructions: "Simmer gently" },
    }).recipe.servings,
    2,
  );
});
