import {
  aiRecipeSelectionFiles,
  input as selectionInput,
  week,
} from "./ai-recipe-selection-fixture.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json, week };
export const files = [
  ...aiRecipeSelectionFiles,
  "supabase/migrations/20260921020754_native_meal_leftovers.sql",
  "supabase/migrations/20260921022759_native_ai_meal_leftovers.sql",
  "supabase/migrations/20260921031147_native_ai_meal_preparation.sql",
  "supabase/migrations/20260921034355_native_ai_preparation_editing.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const source = JSON.parse(
    f.db.sql(
      as(`select public.nest_place_recipe('${id(10)}','${id(800)}',${json(selectionInput())})`),
    ),
  );
  const input = (patch = {}) => ({
    entryId: source.entryId.toUpperCase(),
    sourceWeekStart: week,
    targetWeekStart: week,
    expectedSourceRevision: "1",
    expectedTargetRevision: "1",
    date: "2030-01-08",
    slot: "dinner",
    ...patch,
  });
  const command = (turn, value, call = "leftovers") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','placeLeftovers',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(f.db.sql(as(command(turn, value, call), turn.actor)));
  return { ...f, source, input, command, execute };
}
