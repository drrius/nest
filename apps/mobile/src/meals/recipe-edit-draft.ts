import * as Schema from "effect/Schema";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { RecipeIngredientPatch } from "@nest/contracts/recipe-edit";
import { RecipeIngredientInput } from "@nest/contracts/recipe-creation";
export type EditorIngredient = typeof RecipeIngredientInput.Type & {
  key: string;
  ingredientId: string | null;
};
export const metadataFields = (recipe: SavedMeal) => ({
  title: recipe.title,
  servings: recipe.servings?.toString() ?? "",
  instructions: recipe.instructions ?? "",
  recipeUrl: recipe.recipeUrl ?? "",
  notes: recipe.notes ?? "",
});
export type MetadataFields = ReturnType<typeof metadataFields>;
export const ingredientFields = (item: EditorIngredient) => ({
  name: item.name,
  quantity: item.quantity ?? "",
  unit: item.unit ?? "",
  note: item.note ?? "",
});
export type IngredientFields = ReturnType<typeof ingredientFields>;
export function editorIngredients(recipe: SavedMeal): EditorIngredient[] {
  return recipe.ingredients.map(({ ingredientId, order: _order, ...item }) => ({
    ...item,
    ingredientId,
    key: ingredientId,
  }));
}
function changedFields<T extends Record<string, string>>(
  original: T,
  current: T,
  normalize: (key: string, value: string) => unknown,
) {
  return Object.fromEntries(
    Object.entries(current)
      .filter(([key, value]) => value !== original[key])
      .map(([key, value]) => [key, normalize(key, value)]),
  );
}
function metadataValue(key: string, raw: string) {
  const value = raw.trim();
  if (key === "servings")
    return value === "" ? null : /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  return key === "title" ? value : value || null;
}
const ingredientValue = (key: string, value: string) =>
  key === "name" ? value.trim() : value.trim() || null;
export function keepIngredient(item: EditorIngredient, fields: IngredientFields): EditorIngredient {
  const patch = changedFields(ingredientFields(item), fields, ingredientValue);
  if (item.ingredientId) {
    const validated = Schema.decodeUnknownSync(RecipeIngredientPatch)(patch, {
      onExcessProperty: "error",
    });
    return { ...item, ...validated };
  }
  const { key, ingredientId, ...values } = { ...item, ...patch };
  const validated = Schema.decodeUnknownSync(RecipeIngredientInput)(values, {
    onExcessProperty: "error",
  });
  return { ...validated, key, ingredientId };
}
function selectedIngredient(item: EditorIngredient, original: Map<string, EditorIngredient>) {
  const { key: _key, ingredientId, ...values } = item;
  if (!ingredientId) return { kind: "new" as const, ...values };
  const previous = original.get(ingredientId.toLowerCase());
  if (!previous) throw new Error("Ingredient is not in this recipe baseline");
  const patch = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => value !== previous[key as keyof typeof values]),
  );
  return { kind: "existing" as const, ingredientId, patch };
}
export function recipeEditChanges(
  recipe: SavedMeal,
  fields: MetadataFields,
  items: EditorIngredient[],
) {
  const original = editorIngredients(recipe),
    byId = new Map(original.map((item) => [item.ingredientId!.toLowerCase(), item]));
  const selection = items.map((item) => selectedIngredient(item, byId));
  const unchanged =
    items.length === original.length &&
    selection.every(
      (item, index) =>
        item.kind === "existing" &&
        item.ingredientId === original[index]!.ingredientId &&
        Object.keys(item.patch).length === 0,
    );
  return {
    patch: changedFields(metadataFields(recipe), fields, metadataValue),
    ingredients: unchanged ? null : selection,
  };
}
export function moveEditorIngredient(items: EditorIngredient[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
