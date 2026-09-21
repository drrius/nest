import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, input, existing, added, command, as } from "./recipe-edit-fixture.mjs";

test("metadata patch preserves unknown legacy details, ingredients and planned/grocery history", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  const receipt = f.edit(id(800));
  assert.equal(receipt.previousRevision, "0");
  assert.equal(receipt.revision, "1");
  const recipe = f.recipe(id(200), "1").recipe;
  assert.equal(recipe.title, "Updated soup");
  assert.equal(recipe.servings, null);
  assert.equal(recipe.instructions, null);
  assert.equal(recipe.recipeUrl, "javascript:legacy-link");
  assert.equal(recipe.notes, "Notes are not instructions");
  const after = f.snapshot();
  for (const table of [
    "meal_grocery_templates",
    "meal_plan_entries",
    "nest_meal_week_revisions",
    "grocery_items",
  ])
    assert.equal(after[table], before[table]);
  f.edit(id(801), input("1", { servings: 2, instructions: "Simmer", recipeUrl: null }));
  f.edit(id(802), input("2", { servings: null, instructions: null, notes: null }));
  assert.equal(f.recipe(id(200), "3").recipe.instructions, null);
});
test("ingredient selection preserves retained IDs, archives removals and keeps quantity/unit distinct", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  const receipt = f.edit(
    id(800),
    input("0", { title: "New soup" }, [
      added({ quantity: "250", unit: "g", categoryId: id(400) }),
      existing(300, { quantity: "3/4", note: null }),
    ]),
  );
  assert.equal(receipt.revision, "4");
  const recipe = f.recipe(id(200), "4").recipe;
  assert.equal(recipe.ingredients.length, 2);
  assert.notEqual(recipe.ingredients[0].ingredientId, id(301));
  assert.equal(recipe.ingredients[0].categoryId, id(400));
  assert.equal(recipe.ingredients[1].ingredientId, id(300));
  assert.equal(recipe.ingredients[1].quantity, "3/4");
  assert.equal(recipe.ingredients[1].unit, "cup");
  assert.equal(recipe.ingredients[1].note, null);
  assert.deepEqual(
    recipe.ingredients.map((item) => item.order),
    [0, 1],
  );
  assert.equal(
    f.db.sql(
      `select archived_at is not null and quantity='250' and unit='g' from public.meal_grocery_templates where id='${id(301)}'`,
    ),
    "t",
  );
  assert.equal(
    f.db.sql(
      `select count(*) from public.meal_grocery_templates where meal_definition_id='${id(200)}'`,
    ),
    "3",
  );
  for (const table of ["meal_plan_entries", "grocery_items"])
    assert.equal(f.snapshot()[table], before[table]);
  assert.equal(f.edit(id(801), input("4", {}, [])).revision, "6");
  assert.deepEqual(f.recipe(id(200), "6").recipe.ingredients, []);
});
test("concurrent duplicates edit once; replay after partner edit/archive never reapplies old content", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(command(id(800)))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(saved.revision, "1");
  f.db.sql(
    `update public.meal_definitions set name='Partner change',archived_at=now() where id='${id(200)}'`,
  );
  const before = f.snapshot();
  assert.deepEqual(f.edit(id(800)), saved);
  assert.deepEqual(f.snapshot(), before);
  assert.throws(() => f.edit(id(800), input("0", { title: "Altered retry" })), /operation changed/);
  assert.throws(() => f.edit(id(801), input("2")), /Recipe changed/);
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "1");
});
test("invalid ingredient/category references and final receipt failure roll back all edit effects", (t) => {
  const f = fixture(t);
  f.db
    .sql(`insert into public.meal_grocery_templates(id,household_id,meal_definition_id,name,sort_order)
    values('${id(303)}','${id(10)}','${id(201)}','Other recipe ingredient',0)`);
  const before = f.snapshot();
  for (const selection of [
    [existing(302)],
    [existing(303)],
    [existing(999)],
    [added({ categoryId: id(401) })],
    [added({ categoryId: id(402) })],
  ]) {
    assert.throws(
      () => f.edit(id(800), input("1", { title: "Must roll back" }, selection)),
      /changed/,
    );
    assert.deepEqual(f.snapshot(), before);
  }
  f.db
    .sql(`create function private.reject_edit_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected edit failure'; end $$;
    create trigger reject_edit_receipt before insert on public.nest_recipe_edit_receipts for each row execute function private.reject_edit_receipt()`);
  assert.throws(
    () => f.edit(id(800), input("1", { title: "Rollback" }, [added()])),
    /Injected edit failure/,
  );
  assert.deepEqual(f.snapshot(), before);
});
test("editing authorizes before replay and exposes only own current-member receipts", (t) => {
  const f = fixture(t);
  assert.throws(() => f.edit(id(800), input(), id(3)), /Not authorized/);
  assert.throws(() => f.edit(id(800), { ...input(), definitionId: id(202) }), /Recipe changed/);
  assert.throws(
    () => f.db.sql(`set role anon; select public.nest_edit_recipe('${id(10)}','${id(800)}','{}')`),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as(`select private.nest_patch_recipe_metadata('${id(10)}','${id(200)}','{}')`)),
    /permission denied/,
  );
  f.edit(id(800));
  assert.equal(f.db.sql(as("select count(*) from public.nest_recipe_edit_receipts")), "1");
  assert.equal(f.db.sql(as("select count(*) from public.nest_recipe_edit_receipts", id(2))), "0");
  assert.throws(
    () => f.db.sql(as("delete from public.nest_recipe_edit_receipts")),
    /permission denied/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.edit(id(800)), /Not authorized/);
  assert.equal(f.db.sql(as("select count(*) from public.nest_recipe_edit_receipts")), "0");
});
