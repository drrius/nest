import { files as previous, as, id, json } from "./ai-legacy-confirmation-fixture.mjs";
import { payload as legacy } from "./ai-legacy-dismissal-fixture.mjs";
import { payload as recurring } from "./ai-recurring-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  ...[
    "20260922033013_native_legacy_recurring_fences",
    "20260922034111_native_legacy_adoption_context",
    "20260922192907_native_legacy_adoption_command",
    "20260922195459_native_legacy_adoption_approval",
    "20260922201535_native_ai_legacy_adoption_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  legacy(db);
  db.sql("update public.expense_drafts set status='dismissed'");
  return { ruleId: id(800), configuration: recurring(db).configuration };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "adoption", tool = "proposeLegacyAdoption") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
