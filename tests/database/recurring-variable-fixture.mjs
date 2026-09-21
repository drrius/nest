import {
  fixture as mandates,
  read,
  save,
  as,
  id,
  json,
  approve,
} from "./recurring-mandate-fixture.mjs";
export { read, as, id, json, approve };
export function fixture(t, config = {}) {
  const f = mandates(t);
  for (const name of [
    "20260921205157_native_recurring_fixed_cycle",
    "20260921210444_native_recurring_state_command",
    "20260921211106_native_recurring_state_recovery",
    "20260921215304_native_recurring_resume_command",
    "20260921223609_native_recurring_variable_cycle",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const rule = f.input(100, {
    startDate: today,
    schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    mode: "variable",
    amountCentimes: null,
    allocations: null,
    ...config,
  });
  const receipt = read(f.db, save(500, rule));
  const input = {
    ruleId: rule.ruleId,
    expectedRevision: receipt.revision,
    dueOn: rule.firstDueOn,
    amountCentimes: "101",
    allocations: [
      { memberId: id(1), centimes: "51" },
      { memberId: id(2), centimes: "50" },
    ],
  };
  const post = (op = 600, value = input) =>
    `select public.nest_save_variable_cycle('${id(10)}','${id(op)}',${json(value)})`;
  const execute = (approval, value = input) =>
    `select public.nest_execute_variable_cycle('${id(10)}','${id(600)}',${json(value)},${approval ? `'${approval}'` : "null"})`;
  return { ...f, rule, receipt, input, post, execute, today };
}
