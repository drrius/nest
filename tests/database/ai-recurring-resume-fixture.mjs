import {
  files as previous,
  payload as active,
  as,
  id,
  json,
} from "./ai-recurring-state-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  ...[
    "20260921211106_native_recurring_state_recovery",
    "20260921215304_native_recurring_resume_command",
    "20260921221542_native_recurring_resume_approval",
    "20260921222050_native_recurring_resume_review_fence",
    "20260921223018_native_ai_recurring_resume_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  const change = active(db);
  const paused = JSON.parse(
    db.sql(
      as(
        `set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_save_recurring_state('${id(10)}','${id(601)}',${json(change)})`,
      ),
    ),
  );
  return {
    ruleId: change.ruleId,
    expectedRevision: paused.revision,
    expectedStatus: "paused",
    action: "resume",
    resumeFrom: db.sql(
      `select configuration->>'startDate' from public.nest_recurring_rules where id='${change.ruleId}'`,
    ),
    firstDueOn: db.sql(
      `select next_due_on from private.nest_recurring_execution where rule_id='${change.ruleId}'`,
    ),
  };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "resume", tool = "proposeRecurringResume") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
