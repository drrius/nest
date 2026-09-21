import { files as previous } from "./ai-correction-fixture.mjs";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
import { input } from "../api/recurring-transport-fixture.mjs";
export { id, as, json };
export const files = [
  ...previous,
  ...[
    "20260921190528_native_recurring_cycle_planning",
    "20260921191101_native_recurring_mandates",
    "20260921191203_native_recurring_configuration_command",
    "20260921192022_native_recurring_reads",
    "20260921192950_native_recurring_save_recovery",
    "20260921201455_native_recurring_approval",
    "20260921204217_native_ai_recurring_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date+30,'YYYY-MM-DD')",
  );
  return { ...input(today), ruleId: null };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const command = (turn, input, call = "recurring", tool = "proposeRecurring") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input: payload(f.db), command, execute };
}
