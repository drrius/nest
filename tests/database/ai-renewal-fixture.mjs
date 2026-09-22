import { files as previous, as, id, json } from "./ai-legacy-adoption-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  "supabase/migrations/20260922202827_native_renewal_storage.sql",
  "supabase/migrations/20260922211830_native_ai_renewals.sql",
];
export function fixture(t) {
  const f = recipeJournalFixture(t, files);
  const input = {
    fields: {
      title: "Internet",
      renewalOn: "2028-03-01",
      noticeDays: 1,
      responsibleId: id(2),
      recurringRuleId: null,
    },
  };
  const command = (turn, value, call = "renewal", tool = "createRenewal") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(value)})`;
  const execute = (turn, value, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, value, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
