import { recipeSelectionFiles } from "./recipe-selection-fixture.mjs";
import { aiRecipeCreationFiles } from "./ai-recipe-creation-files.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
const journal = aiRecipeCreationFiles.slice(
  aiRecipeCreationFiles.indexOf(
    "supabase/migrations/20260919220034_native_private_conversations.sql",
  ),
);
export const aiRecipeSelectionFiles = [...new Set([...recipeSelectionFiles, ...journal])];
export const week = "2030-01-07";
export const input = (patch = {}) => ({
  weekStart: week,
  date: week,
  slot: "dinner",
  expectedRevision: "0",
  definitionId: id(200),
  expectedLibraryRevision: "0",
  ...patch,
});
export function fixture(t) {
  const f = recipeJournalFixture(t, aiRecipeSelectionFiles);
  const command = (turn, value, tool = "placeRecipe") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','selection','${tool}',${json(value)})`;
  const execute = (turn, value, tool) =>
    JSON.parse(f.db.sql(as(command(turn, value, tool), turn.actor)));
  return { ...f, command, execute };
}
