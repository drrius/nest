import assert from "node:assert/strict";
import { test } from "node:test";
import * as Schema from "effect/Schema";
import { EditRecipeInput } from "@nest/contracts/recipe-edit";
import {
  editorIngredients,
  metadataFields,
  ingredientFields,
  keepIngredient,
  recipeEditChanges,
  moveEditorIngredient,
} from "../src/meals/recipe-edit-draft.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const recipe = () => ({
  definitionId: id(200),
  title: "😀".repeat(120),
  servings: null,
  instructions: null,
  recipeUrl: "javascript:legacy-link",
  notes: " Notes are not instructions ",
  ingredients: [
    {
      ingredientId: id(300),
      name: "😀".repeat(120),
      quantity: " 1/2 ",
      unit: "cup",
      note: null,
      categoryId: id(400),
      order: 4,
    },
    {
      ingredientId: id(301),
      name: "Tomato",
      quantity: "250",
      unit: "g",
      note: null,
      categoryId: null,
      order: 8,
    },
  ],
});
const validate = (changes) =>
  Schema.decodeUnknownSync(EditRecipeInput)(
    { definitionId: id(200), expectedRevision: "0", ...changes },
    { onExcessProperty: "error" },
  );
test("native metadata edits omit untouched unknown and non-native legacy values", () => {
  const original = recipe(),
    fields = metadataFields(original),
    items = editorIngredients(original);
  assert.deepEqual(recipeEditChanges(original, fields, items), { patch: {}, ingredients: null });
  const changes = recipeEditChanges(original, { ...fields, notes: " New note " }, items);
  assert.deepEqual(changes, { patch: { notes: "New note" }, ingredients: null });
  validate(changes);
  assert.equal(original.instructions, null);
  assert.equal(fields.servings, "");
  assert.equal(fields.instructions, "");
  assert.equal(fields.recipeUrl, "javascript:legacy-link");
  const known = { ...original, servings: 2, instructions: "Simmer" };
  assert.deepEqual(
    recipeEditChanges(known, { ...metadataFields(known), servings: "", instructions: "" }, items)
      .patch,
    { servings: null, instructions: null },
  );
  assert.throws(() => validate(recipeEditChanges(original, { ...fields, servings: "2.5" }, items)));
});
test("native ingredient edit validates changed fields while retaining long legacy name, quantity and category", () => {
  const original = recipe(),
    items = editorIngredients(original),
    initial = ingredientFields(items[0]);
  const edited = keepIngredient(items[0], { ...initial, note: " Chopped " });
  assert.equal(edited.name, original.ingredients[0].name);
  assert.equal(edited.quantity, " 1/2 ");
  assert.equal(edited.categoryId, id(400));
  assert.equal(edited.ingredientId, id(300));
  const changes = recipeEditChanges(original, metadataFields(original), [edited, items[1]]);
  assert.deepEqual(changes.ingredients, [
    { kind: "existing", ingredientId: id(300), patch: { note: "Chopped" } },
    { kind: "existing", ingredientId: id(301), patch: {} },
  ]);
  validate(changes);
  assert.throws(() => keepIngredient(items[0], { ...initial, name: "😀".repeat(119) }));
  assert.equal(items[0].note, null);
});
test("native reorder/removal/new entries keep identities distinct and do not mutate the baseline", () => {
  const original = recipe(),
    items = editorIngredients(original);
  const reordered = moveEditorIngredient(items, 0, 1);
  assert.equal(reordered[0].ingredientId, id(301));
  assert.equal(items[0].ingredientId, id(300));
  assert.deepEqual(recipeEditChanges(original, metadataFields(original), []).ingredients, []);
  const blank = {
    key: id(900),
    ingredientId: null,
    name: "",
    quantity: null,
    unit: null,
    categoryId: null,
    note: null,
  };
  assert.throws(() => keepIngredient(blank, ingredientFields(blank)));
  const added = keepIngredient(blank, { name: "Tomato", quantity: "1/2", unit: "cup", note: "" });
  const changes = recipeEditChanges(original, metadataFields(original), [reordered[0], added]);
  assert.deepEqual(changes.ingredients, [
    { kind: "existing", ingredientId: id(301), patch: {} },
    { kind: "new", name: "Tomato", quantity: "1/2", unit: "cup", note: null, categoryId: null },
  ]);
  validate(changes);
  assert.deepEqual(moveEditorIngredient(items, 0, -1), items);
  assert.throws(() =>
    recipeEditChanges(original, metadataFields(original), [{ ...items[0], ingredientId: id(999) }]),
  );
});
