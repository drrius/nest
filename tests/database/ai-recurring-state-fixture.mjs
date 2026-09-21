import {
  files as previous,
  payload as configuration,
  as,
  id,
  json,
} from "./ai-recurring-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  ...[
    "20260921210444_native_recurring_state_command",
    "20260921213056_native_recurring_state_approval",
    "20260921214518_native_ai_recurring_state_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db, action = "pause") {
  const rule = { ...configuration(db), ruleId: id(300) };
  const saved = JSON.parse(
    db.sql(
      as(
        `set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_save_recurring('${id(10)}','${id(600)}',${json(rule)})`,
      ),
    ),
  );
  return {
    ruleId: rule.ruleId,
    expectedRevision: saved.revision,
    expectedStatus: "active",
    action,
  };
}
export function fixture(t, action = "pause") {
  const f = recipeJournalFixture(t, files);
  const input = payload(f.db, action);
  const command = (turn, input, call = "state", tool = "proposeRecurringState") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
