import { startFixturePostgres } from "./fixture-postgres.mjs";
export const files = [
  "tests/database/conversation-fixture.sql",
  "supabase/migrations/20260920041525_native_food_preferences.sql",
  "supabase/migrations/20260920050551_native_cooking_preferences.sql",
  "supabase/migrations/20260921040437_native_meal_planning_context.sql",
];
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const query = (actor = id(1), home = id(10)) =>
  `select public.nest_meal_planning_context('${actor}','${home}')`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export function fixture(t) {
  const db = startFixturePostgres();
  t?.after(() => db.stop());
  for (const file of files) db.file(file);
  const read = (actor, home) => JSON.parse(db.sql(`set role service_role; ${query(actor, home)}`));
  return { db, read };
}
export function seed(db) {
  for (const [actor, restriction, goal] of [
    [id(1), "No peanuts", 1800],
    [id(2), "Vegetarian", 2400],
  ])
    db.sql(
      as(
        `select public.nest_save_food_profile('${id(10)}','${id(100)}',0,array['${restriction}'],array['Celery'],${goal},1.5)`,
        actor,
      ),
    );
  db.sql(
    as(
      `select public.nest_save_cooking_preferences('${id(10)}','${id(101)}',0,'Quick meals',array['dinner'])`,
    ),
  );
}
