import * as Schema from "effect/Schema";
import { MealWeekStart, StoredMealTitle, StoredMealText } from "./meals.ts";
import { CalendarDate } from "./chores.ts";
import { MealSlot } from "./cooking.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MealIngredientReviewHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literal("meal-ingredients"),
  householdId: Uuid,
  weekStart: MealWeekStart,
  revision: Revision,
});
const Source = { entryId: Uuid, ingredientId: Uuid };
export const MealIngredientCursor = Schema.Struct(Source);
export const IngredientQuantity = Schema.NullOr(StoredMealText(80));
export const ReviewedMealIngredient = Schema.Struct({
  ...Source,
  quantity: IngredientQuantity,
  unit: IngredientQuantity,
});
export const ReadMealIngredients = Schema.Struct({
  weekStart: MealWeekStart,
  expectedRevision: Revision,
  after: Schema.NullOr(MealIngredientCursor),
});
export const MealIngredient = Schema.Struct({
  ...ReviewedMealIngredient.fields,
  mealTitle: StoredMealTitle,
  date: CalendarDate,
  slot: MealSlot,
  name: StoredMealTitle,
  categoryId: Schema.NullOr(Uuid),
  groceryItemId: Schema.NullOr(Uuid),
});
const Skipped = Schema.Struct({
  entryId: Uuid,
  reason: Schema.Literals(["no_recipe", "no_ingredients", "leftovers"]),
});
export const MealIngredientPage = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  weekStart: MealWeekStart,
  revision: Revision,
  ingredients: Schema.Array(MealIngredient).check(Schema.isMaxLength(100)),
  skipped: Schema.Array(Skipped).check(Schema.isMaxLength(21)),
  nextAfter: Schema.NullOr(MealIngredientCursor),
}).check(
  Schema.makeFilter((page) => {
    const keys = page.ingredients.map(sourceKey);
    return (
      keys.every((key, index) => index === 0 || key > keys[index - 1]!) &&
      (page.nextAfter === null ||
        (keys.length === 100 && sourceKey(page.nextAfter) === keys.at(-1)))
    );
  }),
  Schema.makeFilter((page) => {
    const skipped = page.skipped.map((item) => item.entryId.toLowerCase());
    return (
      new Set(skipped).size === skipped.length &&
      !page.ingredients.some((item) => skipped.includes(item.entryId.toLowerCase()))
    );
  }),
  Schema.makeFilter((page) => {
    const added = page.ingredients.flatMap((item) =>
      item.groceryItemId ? [item.groceryItemId.toLowerCase()] : [],
    );
    return new Set(added).size === added.length;
  }),
  Schema.makeFilter((page) => {
    const meals = new Map<string, string>();
    return page.ingredients.every((item) => {
      const key = item.entryId.toLowerCase();
      const details = JSON.stringify([item.mealTitle, item.date, item.slot]);
      const previous = meals.get(key);
      meals.set(key, details);
      return previous === undefined || previous === details;
    });
  }),
  Schema.makeFilter((page) => {
    const end = new Date(Date.parse(`${page.weekStart}T00:00:00Z`) + 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    return page.ingredients.every((item) => item.date >= page.weekStart && item.date <= end);
  }),
);
const Selection = Schema.Array(ReviewedMealIngredient).check(
  Schema.isLengthBetween(1, 4200),
  Schema.makeFilter((rows) => new Set(rows.map(sourceKey)).size === rows.length),
);
export const AddMealIngredientsInput = Schema.Struct({
  weekStart: MealWeekStart,
  expectedRevision: Revision,
  selected: Selection,
});
export const AddMealIngredients = Schema.Struct({
  operationId: Uuid,
  ...AddMealIngredientsInput.fields,
});
export const MealIngredientAddition = Schema.Struct({
  ...Source,
  itemId: Uuid,
  outcome: Schema.Literals(["added", "already_added"]),
});
export const MealIngredientsReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  weekStart: MealWeekStart,
  weekRevision: Revision,
  ingredients: Schema.Array(MealIngredientAddition).check(Schema.isLengthBetween(1, 4200)),
}).check(
  Schema.makeFilter(
    (receipt) => new Set(receipt.ingredients.map(sourceKey)).size === receipt.ingredients.length,
  ),
  Schema.makeFilter(
    (receipt) =>
      new Set(receipt.ingredients.map((item) => item.itemId.toLowerCase())).size ===
      receipt.ingredients.length,
  ),
);
export function sourceKey(source: { entryId: string; ingredientId: string }) {
  return `${source.entryId.toLowerCase()}:${source.ingredientId.toLowerCase()}`;
}
export type MealIngredient = typeof MealIngredient.Type;
export type ReviewedMealIngredient = typeof ReviewedMealIngredient.Type;
export type MealIngredientPage = typeof MealIngredientPage.Type;
export type AddMealIngredients = typeof AddMealIngredients.Type;
export type MealIngredientsReceipt = typeof MealIngredientsReceipt.Type;
