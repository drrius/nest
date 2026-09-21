import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, week } from "./meal-ingredients-fixture.mjs";
test("one full week of 4200 retained ingredients is selected atomically within the fixture statement bound", (t) => {
  const f = fixture(t);
  f.db
    .sql(`insert into public.meal_plan_entries(id,household_id,date,slot,meal_definition_id,title_snapshot,recipe_url_snapshot,notes)
    select ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,'${id(10)}','${week}'::date+n/3,
      (array['breakfast','lunch','dinner'])[n%3+1],meal_definition_id,title_snapshot,recipe_url_snapshot,notes
    from public.meal_plan_entries cross join generate_series(0,20) n where id='${f.placed.entryId}' and n<>2;
    insert into public.nest_planned_recipe_snapshots(household_id,entry_id,library_revision,recipe)
      select e.household_id,e.id,s.library_revision,s.recipe from public.meal_plan_entries e
      cross join public.nest_planned_recipe_snapshots s where s.entry_id='${f.placed.entryId}' and e.id<>s.entry_id;
    update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients}',
      (select jsonb_agg(jsonb_set(jsonb_set(recipe->'ingredients'->0,'{ingredientId}',
        to_jsonb('00000000-0000-4000-8000-'||lpad((11000+n)::text,12,'0'))),'{order}',to_jsonb(n)) order by n)
       from generate_series(0,199) n));`);
  const sql = `select public.nest_add_meal_ingredients('${id(10)}','${id(900)}',
    jsonb_build_object('weekStart','${week}','expectedRevision',
      (select revision::text from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${week}'),
      'selected',(select jsonb_agg(jsonb_build_object('entryId',entry_id,'ingredientId',i->>'ingredientId',
        'quantity',i->'quantity','unit',i->'unit') order by entry_id,i->>'ingredientId')
        from public.nest_planned_recipe_snapshots cross join lateral jsonb_array_elements(recipe->'ingredients') i)))`;
  const receipt = JSON.parse(f.db.sql(as(sql)));
  assert.equal(receipt.ingredients.length, 4200);
  assert.equal(new Set(receipt.ingredients.map((i) => i.itemId)).size, 4200);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "4200");
});
