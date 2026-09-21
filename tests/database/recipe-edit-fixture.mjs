import { createRequire } from "node:module";
import { fixture as creationFixture, id, as } from "./recipe-creation-fixture.mjs";
import { EditRecipeInput, RecipeEditReceipt } from "../../packages/contracts/src/recipe-edit.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
export const Schema = await import(require.resolve("effect/Schema"));
export { id, as, EditRecipeInput };
export const recipeEditMigration = "supabase/migrations/20260921002813_native_recipe_edit.sql";
export const input = (
  expectedRevision = "0",
  patch = { title: "Updated soup" },
  ingredients = null,
) => ({
  definitionId: id(200),
  expectedRevision,
  patch,
  ingredients,
});
export const existing = (n, patch = {}) => ({ kind: "existing", ingredientId: id(n), patch });
export const added = (patch = {}) => ({
  kind: "new",
  name: "Onion",
  quantity: "1",
  unit: null,
  categoryId: null,
  note: null,
  ...patch,
});
export const command = (operation, payload = input(), actor = id(1), household = id(10)) =>
  as(
    `select public.nest_edit_recipe('${household}','${operation}','${JSON.stringify(payload).replaceAll("'", "''")}')`,
    actor,
  );
export function fixture(t) {
  const f = creationFixture(t);
  f.db.file(recipeEditMigration);
  const edit = (operation, payload = input(), actor, household) =>
    Schema.decodeUnknownSync(RecipeEditReceipt)(
      JSON.parse(f.db.sql(command(operation, payload, actor, household))),
      { onExcessProperty: "error" },
    );
  const snapshot = () => ({
    ...f.snapshot(),
    editReceipts: f.db.sql(
      "select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.nest_recipe_edit_receipts r",
    ),
  });
  return { ...f, edit, snapshot };
}
