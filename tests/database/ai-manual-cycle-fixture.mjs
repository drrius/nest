import {
  files as previous,
  payload as variable,
  as,
  id,
  json,
} from "./ai-variable-cycle-fixture.mjs";
import { payload as expense } from "./native-expense-helpers.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous.flatMap((file) =>
    file.endsWith("20260921144718_native_grocery_expense.sql")
      ? ["supabase/migrations/20260921130419_native_expense_save_cancel.sql", file]
      : [file],
  ),
  ...[
    "20260921232720_native_recurring_manual_cycle",
    "20260921235439_native_recurring_manual_approval",
    "20260921235905_native_manual_cycle_context",
    "20260922000524_native_ai_manual_cycle_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  const input = variable(db);
  const source = JSON.parse(
    db.sql(
      as(
        `set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_save_expense('${id(10)}','${id(602)}',${json(expense({ date: input.dueOn }))})`,
      ),
    ),
  );
  return {
    ruleId: input.ruleId,
    expectedRevision: input.expectedRevision,
    dueOn: input.dueOn,
    sourceEventId: source.eventId,
  };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "cycle", tool = "proposeManualCycle") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
