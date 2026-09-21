import { files as refundFiles } from "./ai-refund-fixture.mjs";
import { expense } from "./money-expense-helpers.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
export const files = [
  ...refundFiles,
  "tests/database/legacy-money/opening-correction-lineage.sql",
  "tests/database/legacy-money/correction-command.sql",
  "supabase/migrations/20260921144718_native_grocery_expense.sql",
  "supabase/migrations/20260921160415_native_correction_command.sql",
  "supabase/migrations/20260921161115_native_correction_context.sql",
  "supabase/migrations/20260921163322_native_correction_approval.sql",
  "supabase/migrations/20260921163801_native_ai_correction_proposal.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const source = JSON.parse(
    f.db.sql(as(expense("correction-seed", { amount: 1000, own: 400 }))),
  ).financial_event_id;
  const command = (turn, input, call = "correction", tool = "proposeCorrection") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, source, command, execute };
}
