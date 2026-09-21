import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  installIngredientStorage,
  id,
  as,
  json,
  week,
} from "./meal-ingredients-fixture.mjs";
import { fixture as approval, target } from "./meal-proposal-approval-fixture.mjs";
test("approved generated recipes remain shopping sources without inventing a saved-library definition", (t) => {
  const f = approval(t);
  installIngredientStorage(f.db);
  const proposal = f.ready();
  const approved = f.approve(id(901), target(proposal));
  assert.equal(f.db.sql("select count(*) from public.grocery_items"), "0");
  const page = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_read_meal_ingredients('${id(10)}','${week}','${approved.weekRevision}',null)`,
      ),
    ),
  );
  assert.equal(page.ingredients.length, 7);
  const selected = page.ingredients.map(({ entryId, ingredientId, quantity, unit }) => ({
    entryId,
    ingredientId,
    quantity,
    unit,
  }));
  const receipt = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_add_meal_ingredients('${id(10)}','${id(902)}',${json({ weekStart: week, expectedRevision: approved.weekRevision, selected })})`,
      ),
    ),
  );
  assert.equal(receipt.ingredients.length, 7);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "7");
  assert.equal(
    f.db.sql(
      "select count(*) from public.nest_planned_recipe_snapshots where library_revision is null",
    ),
    "7",
  );
});
test("archived household categories become uncategorized but cannot smuggle a foreign category", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.grocery_categories(id,household_id,name,sort_order,archived_at) values('${id(600)}','${id(10)}','Archived',0,now()),('${id(601)}','${id(20)}','Private',0,null)`,
  );
  f.db.sql(
    `update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients,0,categoryId}',to_jsonb('${id(600)}'::text)) where entry_id='${f.placed.entryId}'`,
  );
  assert.equal(f.review().ingredients[0].categoryId, null);
  const first = f.add(id(900), f.input({ selected: [f.input().selected[0]] }));
  assert.equal(
    f.db.sql(
      `select category_id is null from public.grocery_items where id='${first.ingredients[0].itemId}'`,
    ),
    "t",
  );
  f.db.sql(
    `update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients,1,categoryId}',to_jsonb('${id(601)}'::text)) where entry_id='${f.placed.entryId}'`,
  );
  assert.throws(() => f.add(id(901)), /category changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "1");
});
test("an exact receipt survives later meal removal but a new operation cannot use removed sources", (t) => {
  const f = fixture(t),
    value = f.input(),
    saved = f.add(id(900));
  f.db.sql(
    as(
      `select public.nest_remove_meal('${id(10)}','${id(901)}',${json({ entryId: f.placed.entryId, weekStart: week, expectedRevision: value.expectedRevision })})`,
    ),
  );
  assert.deepEqual(f.add(id(900)), saved);
  assert.throws(() => f.add(id(902)), /changed/);
});
