import { files as previous, as, id, json } from "./ai-manual-cycle-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  "tests/database/legacy-recurring/rules.sql",
  "tests/database/legacy-recurring/draft-columns.sql",
  ...[
    "20260922005927_native_legacy_recurring_inventory",
    "20260922012902_native_legacy_recurring_drafts",
    "20260922014006_native_legacy_draft_dismissal",
    "20260922020528_native_legacy_dismissal_approval",
    "20260922021746_native_legacy_dismissal_withdrawal",
    "20260922022525_native_ai_legacy_dismissal_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  db.sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on) values('${id(800)}','${id(10)}','Legacy rule',101,'${id(1)}','[]','weekly',1,true,'2026-01-05');
  insert into public.expense_drafts(id,household_id,recurring_expense_rule_id,description,occurred_on) values('${id(900)}','${id(10)}','${id(800)}','Original draft','2026-01-05')`);
  return { draftId: id(900) };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "draft", tool = "proposeLegacyDismissal") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
