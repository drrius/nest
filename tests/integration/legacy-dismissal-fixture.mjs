import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
export { id, run };
export async function fixture(t, extraFiles = []) {
  const f = await worker(t, [
    "tests/database/legacy-recurring/rules.sql",
    "tests/database/legacy-recurring/draft-columns.sql",
    "supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql",
    "supabase/migrations/20260922012902_native_legacy_recurring_drafts.sql",
    "supabase/migrations/20260922014006_native_legacy_draft_dismissal.sql",
    ...extraFiles,
  ]);
  f.db
    .sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on) values('${id(800)}','${id(10)}','Legacy rule',101,'${id(1)}','[]','weekly',1,true,'2026-01-05');
  insert into public.expense_drafts(id,household_id,recurring_expense_rule_id,description,occurred_on) values('${id(900)}','${id(10)}','${id(800)}','Original draft','2026-01-05')`);
  const client = f.client(),
    context = await run(client.legacyDraftContext(id(900)));
  const command = {
    operationId: id(700),
    input: { draftId: id(900), ruleId: id(800), reviewToken: context.reviewToken },
  };
  return { ...f, native: client, context, command };
}
