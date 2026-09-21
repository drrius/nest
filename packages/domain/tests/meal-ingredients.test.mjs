import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { reconcileIngredientChoices, selectedMealIngredients } from "../src/meal-ingredients.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n, patch = {}) => ({
  entryId: id(1),
  ingredientId: id(n + 100),
  quantity: "1/2",
  unit: "cup",
  groceryItemId: null,
  ...patch,
});
test("pantry exclusions and reviewed text survive refresh while new or already-added sources stay excluded", () => {
  const rows = [row(0), row(1), row(2, { groceryItemId: id(900) })];
  const previous = [
    { ...row(0), selected: false },
    { ...row(1), quantity: "2", unit: "tbsp", selected: true },
    { ...row(2), selected: true },
  ];
  const next = reconcileIngredientChoices([...rows, row(3)], previous);
  assert.deepEqual(
    next.map((item) => item.selected),
    [false, true, false, false],
  );
  assert.deepEqual(selectedMealIngredients(next), [
    { entryId: id(1), ingredientId: id(101), quantity: "2", unit: "tbsp" },
  ]);
  assert.equal(previous[2].selected, true);
});
test("review never combines sources or changes quantity/unit text across arbitrary refreshes", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          quantity: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
          unit: fc.option(fc.string({ maxLength: 80 }), { nil: null }),
          selected: fc.boolean(),
        }),
        { maxLength: 100 },
      ),
      (values) => {
        const previous = values.map((value, index) => ({ ...row(index), ...value }));
        const rows = values
          .map((_value, index) => row(index, { quantity: null, unit: null }))
          .reverse();
        const next = reconcileIngredientChoices(rows, previous);
        assert.equal(next.length, previous.length);
        for (const choice of next) {
          const original = previous.find((item) => item.ingredientId === choice.ingredientId);
          assert.equal(choice.quantity, original.quantity);
          assert.equal(choice.unit, original.unit);
          assert.equal(choice.selected, original.selected);
        }
        assert.equal(
          selectedMealIngredients(next).length,
          values.filter((value) => value.selected).length,
        );
        assert.deepEqual(reconcileIngredientChoices(rows, next), next);
      },
    ),
    { numRuns: 1000 },
  );
});
test("removed sources cannot transfer selection to replacement IDs and duplicate identity is rejected", () => {
  const previous = [{ ...row(0), selected: true }];
  const replacement = row(0, { entryId: id(2) });
  assert.equal(reconcileIngredientChoices([replacement], previous)[0].selected, false);
  assert.throws(() => reconcileIngredientChoices([row(0), row(0)], previous), /Duplicate/);
  assert.throws(() => selectedMealIngredients([...previous, ...previous]), /Duplicate/);
});
