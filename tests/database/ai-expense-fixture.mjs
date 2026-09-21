import { aiCommandFiles } from "./ai-command-files.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
export const files = [
  "tests/database/money-expense-fixture.sql",
  ...aiCommandFiles.slice(4),
  "supabase/migrations/20260921074554_native_ai_meal_proposals.sql",
  "supabase/migrations/20260921114330_native_expense_command.sql",
  "supabase/migrations/20260921120149_native_expense_approval.sql",
  "supabase/migrations/20260921120810_native_ai_expense_proposal.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const command = (turn, input, call = "expense", tool = "proposeExpense") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, command, execute };
}
