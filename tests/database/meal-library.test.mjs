import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, pageSql, recipeSql } from "./meal-library-fixture.mjs";

test("legacy recipe reads preserve quantities, units, order and unknown metadata without rewriting rows", (t) => {
  const f = fixture(t),
    page = f.page(),
    detail = f.recipe();
  assert.equal(page.revision, "0");
  assert.deepEqual(
    page.meals.map((meal) => meal.definitionId),
    [id(200), id(201)],
  );
  assert.equal(page.nextAfterId, null);
  assert.equal(detail.recipe.servings, null);
  assert.equal(detail.recipe.instructions, null);
  assert.equal(detail.recipe.notes, "Notes are not instructions");
  assert.equal(detail.recipe.recipeUrl, "javascript:legacy-link");
  assert.deepEqual(
    detail.recipe.ingredients.map((item) => [item.ingredientId, item.quantity, item.unit]),
    [
      [id(300), "1/2", "cup"],
      [id(301), "250", "g"],
    ],
  );
  assert.deepEqual(f.recipe(id(200), "0", id(2)), detail);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_library_revisions"), "0");
  f.db.sql(
    `update public.meal_definitions set nest_servings=4,nest_instructions='Simmer for 20 minutes' where id='${id(200)}'`,
  );
  assert.equal(f.recipe(id(200), "1").recipe.servings, 4);
  assert.equal(f.recipe(id(200), "1").recipe.instructions, "Simmer for 20 minutes");
});

test("both table RLS and composite references reject foreign recipes, ingredients and categories", (t) => {
  const f = fixture(t);
  assert.throws(() => f.page(null, null, id(3)), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${pageSql()}`), /permission denied/);
  assert.throws(() => f.db.sql(`set role authenticated; ${pageSql()}`), /Not authorized/);
  assert.equal(f.recipe(id(202)).recipe, null);
  for (const table of ["meal_definitions", "meal_grocery_templates"]) {
    assert.equal(
      f.db.sql(as(`select count(*) from public.${table} where household_id='${id(20)}'`)),
      "0",
    );
    assert.equal(
      f.db.sql(
        as(
          `with changed as(update public.${table} set archived_at=now() where household_id='${id(20)}' returning id) select count(*) from changed`,
        ),
      ),
      "0",
    );
    assert.throws(() => f.db.sql(as(`delete from public.${table}`)), /permission denied/);
  }
  assert.throws(
    () =>
      f.db.sql(
        as(`insert into public.meal_definitions(household_id,name) values('${id(20)}','Forged')`),
      ),
    /row-level security/,
  );
  assert.throws(
    () =>
      f.db.sql(
        as(
          `insert into public.meal_grocery_templates(household_id,meal_definition_id,name,sort_order) values('${id(10)}','${id(202)}','Forged',0)`,
        ),
      ),
    /foreign key/,
  );
  assert.throws(
    () =>
      f.db.sql(
        as(
          `insert into public.meal_grocery_templates(household_id,meal_definition_id,name,sort_order) values('${id(20)}','${id(202)}','Forged',0)`,
        ),
      ),
    /row-level security/,
  );
  f.db.sql(
    `insert into public.grocery_categories(id,household_id,name,sort_order) values('${id(400)}','${id(20)}','Foreign',0)`,
  );
  assert.throws(
    () =>
      f.db.sql(
        as(
          `update public.meal_grocery_templates set grocery_category_id='${id(400)}' where id='${id(300)}'`,
        ),
      ),
    /foreign key/,
  );
  assert.throws(
    () => f.db.sql(as("insert into public.nest_meal_library_revisions values('" + id(10) + "',1)")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as("select private.nest_advance_meal_library()")),
    /permission denied/,
  );
  f.db.sql(`update public.meal_definitions set name='Changed' where id='${id(200)}'`);
  assert.equal(f.db.sql(as(`select count(*) from public.nest_meal_library_revisions`, id(3))), "0");
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.throws(() => f.page(null, null, id(2)), /Not authorized/);
  assert.throws(() => f.recipe(id(200), "1", id(2)), /Not authorized/);
});

test("ingredient and definition edits, archives and deletes advance revisions; rollback and overflow preserve contents", (t) => {
  const f = fixture(t),
    before = f.recipe();
  f.db.sql(
    as(
      `begin; update public.meal_definitions set name='Changed' where id='${id(200)}'; update public.meal_definitions set name='Legacy soup' where id='${id(200)}'; commit`,
    ),
  );
  assert.equal(f.page().revision, "2");
  f.db.sql(
    as(
      `begin; update public.meal_grocery_templates set quantity='9' where id='${id(300)}'; rollback`,
    ),
  );
  assert.deepEqual(f.recipe(id(200), "2"), { ...before, revision: "2" });
  f.db.sql(as(`update public.meal_grocery_templates set archived_at=now() where id='${id(300)}'`));
  assert.equal(f.recipe(id(200), "3").recipe.ingredients.length, 1);
  f.db.sql(as(`update public.meal_definitions set archived_at=now() where id='${id(200)}'`));
  assert.equal(f.recipe(id(200), "4").recipe, null);
  assert.deepEqual(
    f.page().meals.map((meal) => meal.definitionId),
    [id(201)],
  );
  f.db.sql(`delete from public.meal_grocery_templates where id='${id(300)}'`);
  assert.equal(f.page().revision, "5");
  f.db.sql(
    `update public.nest_meal_library_revisions set revision=9223372036854775807 where household_id='${id(10)}'`,
  );
  const full = f.page();
  assert.equal(full.revision, "9223372036854775807");
  assert.throws(
    () => f.db.sql(as(`update public.meal_definitions set name='Overflow' where id='${id(201)}'`)),
    /bigint out of range/,
  );
  assert.deepEqual(f.page(), full);
});

test("bounded keyset pages cover each recipe once and reject an obsolete cursor after any ingredient edit", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.meal_definitions(id,household_id,name) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(10)}','Recipe '||n from generate_series(1000,1120) n`,
  );
  let page = f.page();
  const revision = page.revision,
    collected = [...page.meals];
  assert.equal(page.meals.length, 50);
  assert.equal(page.nextAfterId, page.meals.at(-1).definitionId);
  const cursor = page.nextAfterId;
  while (page.nextAfterId) {
    page = f.page(page.nextAfterId, revision);
    collected.push(...page.meals);
  }
  assert.equal(collected.length, 123);
  assert.equal(new Set(collected.map((meal) => meal.definitionId)).size, 123);
  assert.equal(page.meals.length, 23);
  f.db.sql(as(`update public.meal_grocery_templates set quantity='2' where id='${id(300)}'`));
  assert.throws(() => f.page(cursor, revision), /Meal library changed/);
  assert.throws(() => f.recipe(id(200), revision), /Meal library changed/);
  assert.throws(() => f.page(cursor, null), /cursor needs its revision/);
  for (const value of ["01", "-1", "9223372036854775808", "1.0", "0\n", ""]) {
    assert.throws(() => f.page(null, value), /Invalid library revision/);
  }
  assert.throws(
    () => f.db.sql(as(recipeSql(null, f.page().revision))),
    /Invalid saved meal request/,
  );
  assert.throws(() => f.db.sql(as(recipeSql(id(200), null))), /Invalid saved meal request/);
});

test("oversized legacy recipes fail explicitly rather than truncate; maximum Unicode text remains intact", (t) => {
  const f = fixture(t);
  f.db
    .sql(`update public.meal_definitions set name=repeat('🥣',120),notes=repeat('🥣',4000) where id='${id(200)}';
    insert into public.meal_grocery_templates(household_id,meal_definition_id,name,quantity,unit,note,sort_order)
    select '${id(10)}','${id(200)}',repeat('🥣',120),repeat('🥣',80),repeat('🥣',80),case when n=199 then repeat('🥣',1000) else null end,n from generate_series(2,199) n`);
  const recipe = f.recipe(id(200), f.page().revision).recipe;
  assert.equal(recipe.ingredients.length, 200);
  assert.equal(recipe.title, "🥣".repeat(120));
  assert.equal(recipe.notes, "🥣".repeat(4000));
  assert.equal(recipe.ingredients.at(-1).unit, "🥣".repeat(80));
  f.db.sql(
    `insert into public.meal_grocery_templates(household_id,meal_definition_id,name,sort_order) values('${id(10)}','${id(200)}','Excess ingredient',200)`,
  );
  assert.throws(() => f.recipe(id(200), f.page().revision), /exceeds supported ingredient count/);
});
