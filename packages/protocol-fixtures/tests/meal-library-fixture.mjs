import { account } from "./offline-fixture.mjs";
export const id = (n) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const summary = (n) => ({ definitionId: id(n), title: `Recipe ${n}`, servings: null });
export const page = (revision = "0", start = 1, count = 2, more = false) => ({
  version: 1,
  householdId: account.household,
  revision,
  meals: Array.from({ length: count }, (_, n) => summary(start + n)),
  nextAfterId: more ? id(start + count - 1) : null,
});
export const recipe = (revision = "0") => ({
  version: 1,
  householdId: account.household,
  revision,
  recipe: {
    ...summary(1),
    recipeUrl: null,
    notes: "Old note",
    instructions: null,
    ingredients: [],
  },
});
export const target = { definitionId: id(1), expectedRevision: "0" };
