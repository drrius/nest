import { files as settlementFiles } from "./ai-settlement-fixture.mjs";
import { expense } from "./money-expense-helpers.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
export { id, as, json };
export const files = [
  ...settlementFiles,
  "tests/database/legacy-money/refund-command.sql",
  "supabase/migrations/20260921105214_native_money_detail_read.sql",
  "supabase/migrations/20260921151001_native_refund_command.sql",
  "supabase/migrations/20260921154140_native_refund_approval.sql",
  "supabase/migrations/20260921154931_native_ai_refund_proposal.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const source = JSON.parse(
    f.db.sql(as(expense("refund-seed", { amount: 1000, own: 400 }))),
  ).financial_event_id;
  const command = (turn, input, call = "refund", tool = "proposeRefund") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, source, command, execute };
}
