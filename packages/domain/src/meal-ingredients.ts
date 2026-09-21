export type IngredientSource = {
  entryId: string;
  ingredientId: string;
  quantity: string | null;
  unit: string | null;
};
export type IngredientReviewRow = IngredientSource & { groceryItemId: string | null };
export type IngredientChoice = IngredientSource & { selected: boolean };
const key = (source: IngredientSource) =>
  `${source.entryId.toLowerCase()}:${source.ingredientId.toLowerCase()}`;
// Reconcile by retained identity, not ingredient name. New rows require explicit selection.
export function reconcileIngredientChoices(
  rows: readonly IngredientReviewRow[],
  previous: readonly IngredientChoice[],
): IngredientChoice[] {
  const choices = new Map(previous.map((choice) => [key(choice), choice]));
  if (choices.size !== previous.length || new Set(rows.map(key)).size !== rows.length)
    throw new Error("Duplicate ingredient source");
  return rows.map((row) => {
    const prior = choices.get(key(row));
    return {
      entryId: row.entryId,
      ingredientId: row.ingredientId,
      quantity: prior ? prior.quantity : row.quantity,
      unit: prior ? prior.unit : row.unit,
      selected: row.groceryItemId === null && (prior?.selected ?? false),
    };
  });
}
export function selectedMealIngredients(choices: readonly IngredientChoice[]): IngredientSource[] {
  if (new Set(choices.map(key)).size !== choices.length)
    throw new Error("Duplicate ingredient source");
  return choices
    .filter((choice) => choice.selected)
    .map(({ entryId, ingredientId, quantity, unit }) => ({
      entryId,
      ingredientId,
      quantity,
      unit,
    }));
}
