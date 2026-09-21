import {
  files as preparationFiles,
  input as creationInput,
  seed,
  week,
} from "./ai-meal-preparation-fixture.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json, week, seed, creationInput };
export const files = [
  ...preparationFiles,
  "supabase/migrations/20260920093203_native_routine_editing.sql",
  "supabase/migrations/20260921032305_native_meal_preparation_editing.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  seed(f.db);
  const created = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_create_meal_preparation('${id(10)}','${id(820)}',${json(creationInput())})`,
      ),
    ),
  );
  const input = (patch = { instructions: null }) => ({
    entryId: created.entryId,
    weekStart: week,
    expectedRevision: created.revision,
    routineId: created.routineId,
    expectedRoutineVersion: created.routineVersion,
    patch,
  });
  const command = (turn, value, call = "edit-preparation") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','editMealPreparation',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, value, call), turn.actor)));
  return { ...f, created, input, command, execute };
}
