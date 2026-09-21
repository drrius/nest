import { fixture as removalFixture, id, as, week } from "./meal-removal-fixture.mjs";
export { id, as, week };
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export function fixture(t) {
  const f = removalFixture();
  t.after(() => f.db.stop());
  f.db.file("supabase/migrations/20260921024101_native_meal_preparation.sql");
  const meal = f.add(800);
  const input = (patch = {}) => ({
    ...meal,
    preparation: {
      title: "Soak beans",
      instructions: "Use cold water",
      dueOn: "2030-01-06",
      assignment: { policy: "shared" },
    },
    ...patch,
  });
  const command = (operation, value) =>
    `select public.nest_create_meal_preparation('${id(10)}','${operation}',${json(value)})`;
  const create = (operation, value = input(), actor = id(1)) =>
    JSON.parse(f.db.sql(as(command(operation, value), actor)));
  const snapshot = () =>
    f.db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(t) order by id) from public.routines t),
    'occurrences',(select jsonb_agg(to_jsonb(t) order by id) from public.routine_occurrences t),
    'receipts',(select jsonb_agg(to_jsonb(t)) from public.nest_meal_preparation_receipts t),
    'activity',(select jsonb_agg(to_jsonb(t) order by id) from public.activity_events t),
    'weeks',(select jsonb_agg(to_jsonb(t)) from public.nest_meal_week_revisions t))`);
  return { ...f, meal, input, command, create, snapshot };
}
