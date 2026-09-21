import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
export { id, run };
export async function fixture(t) {
  const f = await recurringApiFixture(
    t,
    [
      "20260921205157_native_recurring_fixed_cycle",
      "20260921210444_native_recurring_state_command",
      "20260921211106_native_recurring_state_recovery",
      "20260921215304_native_recurring_resume_command",
      "20260921223609_native_recurring_variable_cycle",
      "20260921224449_native_recurring_cycle_save_recovery",
    ].map((name) => `supabase/migrations/${name}.sql`),
  );
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const rule = {
    ...f.rule,
    firstDueOn: today,
    configuration: {
      ...f.rule.configuration,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
      mode: "variable",
      amountCentimes: null,
      allocations: null,
    },
  };
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule }));
  const command = {
    operationId: id(700),
    input: {
      ruleId: rule.ruleId,
      expectedRevision: saved.revision,
      dueOn: today,
      amountCentimes: "101",
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: "50" },
      ],
    },
  };
  return { ...f, rule, command };
}
