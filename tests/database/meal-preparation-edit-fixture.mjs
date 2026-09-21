import { fixture as preparationFixture, id, as, week, json } from "./meal-preparation-fixture.mjs";
export { id, as, week, json };
export function fixture(t) {
  const f = preparationFixture(t);
  f.db.file("supabase/migrations/20260920093203_native_routine_editing.sql");
  f.db.file("supabase/migrations/20260921032305_native_meal_preparation_editing.sql");
  const created = f.create(id(810));
  const input = (patch = { title: "Prepare beans" }, changes = {}) => ({
    ...f.meal,
    routineId: created.routineId,
    expectedRoutineVersion: created.routineVersion,
    patch,
    ...changes,
  });
  const command = (operation, value) =>
    `select public.nest_edit_meal_preparation('${id(10)}','${operation}',${json(value)})`;
  const edit = (operation, value = input(), actor = id(1)) =>
    JSON.parse(f.db.sql(as(command(operation, value), actor)));
  const state = () =>
    JSON.parse(
      f.db.sql(
        `select jsonb_build_object('routine',(select to_jsonb(r) from public.routines r where id='${created.routineId}'),'occurrence',(select to_jsonb(o) from public.routine_occurrences o where id='${created.occurrenceId}'))`,
      ),
    );
  return { ...f, created, input, command, edit, state };
}
