import { files as previous, as, id, json } from "./ai-recurring-resume-fixture.mjs";
import { payload as configuration } from "./ai-recurring-fixture.mjs";
import { recipeJournalFixture } from "./ai-recipe-creation-fixture.mjs";
export { as, id, json };
export const files = [
  ...previous,
  ...[
    "20260921205157_native_recurring_fixed_cycle",
    "20260921223609_native_recurring_variable_cycle",
    "20260921224449_native_recurring_cycle_save_recovery",
    "20260921230643_native_recurring_variable_approval",
    "20260921232013_native_ai_variable_cycle_proposal",
  ].map((name) => `supabase/migrations/${name}.sql`),
];
export function payload(db) {
  const today = db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const base = configuration(db);
  const rule = {
    ...base,
    ruleId: id(300),
    firstDueOn: today,
    configuration: {
      ...base.configuration,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
      mode: "variable",
      amountCentimes: null,
      allocations: null,
    },
  };
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
    dueOn: today,
    amountCentimes: "101",
    allocations: [
      { memberId: id(1), centimes: "51" },
      { memberId: id(2), centimes: "50" },
    ],
  };
}
export function fixture(t) {
  const f = recipeJournalFixture(t, files),
    input = payload(f.db);
  const command = (turn, input, call = "cycle", tool = "proposeVariableCycle") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','${tool}',${json(input)})`;
  const execute = (turn, input, call, tool) =>
    JSON.parse(f.db.sql(as(command(turn, input, call, tool), turn.actor)));
  return { ...f, input, command, execute };
}
