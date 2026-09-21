import { fixture as correction, id, as, correct } from "./money-correction-fixture.mjs";
export { id, as, correct };
export function fixture(t) {
  const f = correction(t);
  for (const file of [
    "supabase/migrations/20260919213407_native_action_approvals.sql",
    "supabase/migrations/20260921114330_native_expense_command.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "supabase/migrations/20260921151001_native_refund_command.sql",
  ])
    f.db.file(file);
  const source = f.seed("refund-source", 1000, 400);
  const payload = (patch = {}) => ({
    sourceEventId: source,
    description: "Refund",
    amountCentimes: "300",
    payerId: id(1),
    allocations: [
      { memberId: id(1), centimes: "100" },
      { memberId: id(2), centimes: "200" },
    ],
    expectedRemaining: [
      { memberId: id(1), centimes: "400" },
      { memberId: id(2), centimes: "600" },
    ],
    date: "2026-09-21",
    note: null,
    ...patch,
  });
  const context = (actor = 1) =>
    f.record(`select public.nest_refund_context('${id(10)}','${source}')`, actor);
  return { ...f, source, payload, context };
}
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
/** @param {number} operation @param {object} input @param {string | null} [approval] */
export function command(operation, input, approval = null) {
  return `select public.${approval ? "nest_execute_refund" : "nest_save_refund"}('${id(10)}','${id(operation)}',${json(input)}${approval ? `,'${approval}'` : ""})`;
}
export function approve(f, operation, input) {
  const approval = f.db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(operation)}','expenses.refund',1,${json(input)})`,
    ),
  );
  f.db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(operation)}','expenses.refund',1,${json(input)},true)`,
    ),
  );
  return approval;
}
