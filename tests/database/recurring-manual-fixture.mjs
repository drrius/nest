import { fixture as money, id, as } from "./money-correction-fixture.mjs";
import { json } from "./native-correction-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = money(t);
  for (const name of [
    "20260919213407_native_action_approvals",
    "20260921114330_native_expense_command",
    "20260921105214_native_money_detail_read",
    "20260921130419_native_expense_save_cancel",
    "20260921151001_native_refund_command",
    "20260921144718_native_grocery_expense",
    "20260921160415_native_correction_command",
    "20260921190528_native_recurring_cycle_planning",
    "20260921191101_native_recurring_mandates",
    "20260921191203_native_recurring_configuration_command",
    "20260921205157_native_recurring_fixed_cycle",
    "20260921210444_native_recurring_state_command",
    "20260921211106_native_recurring_state_recovery",
    "20260921215304_native_recurring_resume_command",
    "20260921223609_native_recurring_variable_cycle",
    "20260921224449_native_recurring_cycle_save_recovery",
    "20260921232720_native_recurring_manual_cycle",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const record = (sql, actor = 1) => JSON.parse(f.db.sql(as(actor, sql)));
  const rule = (n = 300) => ({
    ruleId: id(n),
    expectedRevision: null,
    firstDueOn: today,
    configuration: {
      description: "Recurring obligation",
      mode: "fixed",
      amountCentimes: "101",
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: "50" },
      ],
      payerId: id(1),
      categoryId: null,
      note: null,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    },
  });
  const source = (op = 400, amount = "990", own = "300", date = today) =>
    record(
      `select public.nest_save_expense('${id(10)}','${id(op)}',${json({
        description: "Explicitly selected manual entry",
        amountCentimes: amount,
        payerId: id(2),
        allocations: [
          { memberId: id(1), centimes: own },
          { memberId: id(2), centimes: String(BigInt(amount) - BigInt(own)) },
        ],
        date,
        note: "Retained original",
        categoryId: null,
      })})`,
    ).eventId;
  const setup = (n = 300, event = source(), mode = "fixed") => {
    const input = rule(n);
    if (mode === "variable")
      Object.assign(input.configuration, { mode, amountCentimes: null, allocations: null });
    const saved = record(
      `select public.nest_save_recurring('${id(10)}','${id(n + 1000)}',${json(input)})`,
    );
    return {
      ruleId: input.ruleId,
      expectedRevision: saved.revision,
      dueOn: today,
      sourceEventId: event,
    };
  };
  /** @param {object} input @param {number} [op] @param {string|null} [approval] */
  const command = (input, op = 500, approval = null) =>
    `select public.${approval ? "nest_execute_manual_cycle" : "nest_save_manual_cycle"}('${id(10)}','${id(op)}',${json(input)}${approval ? `,'${approval}'` : ""})`;
  return { ...f, today, record, rule, source, setup, command };
}
