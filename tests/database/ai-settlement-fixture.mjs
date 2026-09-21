import { files as expenseFiles } from "./ai-expense-fixture.mjs";
import { expense } from "./money-expense-helpers.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
export const files = [
  ...expenseFiles,
  "tests/database/legacy-money/settlement-command.sql",
  "supabase/migrations/20260921134717_native_settlement_command.sql",
  "supabase/migrations/20260921140302_native_settlement_approval.sql",
  "supabase/migrations/20260921141015_native_ai_settlement_proposal.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  f.db.sql(as(expense("settlement-seed", { amount: 1000, own: 0 })));
  const command = (turn, input, call = "settlement", tool = "proposeSettlement") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, command, execute };
}
