import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedMealRehearsal(db) {
  db.sql(`insert into public.meal_definitions(id,household_id,name,notes)
    values('${id(1000)}','${id(10)}','Synthetic saved meal','Retained recipe notes');
    insert into public.meal_grocery_templates(id,household_id,meal_definition_id,name,quantity,unit,sort_order)
    values('${id(1001)}','${id(10)}','${id(1000)}','Synthetic ingredient','250','g',0);
    insert into public.meal_plan_entries(id,household_id,date,slot,meal_definition_id,title_snapshot,leftover_of_entry_id,removed_at)
    values('${id(1010)}','${id(10)}','2026-09-21','dinner','${id(1000)}','Retained meal title',null,null),
      ('${id(1011)}','${id(10)}','2026-09-22','lunch',null,'Retained leftovers','${id(1010)}',null),
      ('${id(1012)}','${id(10)}','2026-09-23','dinner',null,'Retained removed meal',null,'2026-09-20');`);
}
export function captureMealHistory(db) {
  return db.sql(`select jsonb_build_object(
    'recipes',(select jsonb_agg(to_jsonb(r)-'nest_servings'-'nest_instructions' order by id) from public.meal_definitions r),
    'ingredients',(select jsonb_agg(to_jsonb(i) order by id) from public.meal_grocery_templates i),
    'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e)
  )`);
}
export function verifyMealRehearsal(db, before) {
  assert.equal(captureMealHistory(db), before, "Legacy meal records changed");
  const week = JSON.parse(
    db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}';
    select public.nest_meal_week_snapshot('${id(10)}','2026-09-21')`),
  );
  assert.deepEqual(
    week.entries.map((entry) => entry.entryId),
    [id(1010), id(1011)],
  );
  return {
    passed: true,
    retainedRecipes: 1,
    retainedIngredients: 1,
    retainedEntries: 3,
    activeWeekEntries: week.entries.length,
  };
}
