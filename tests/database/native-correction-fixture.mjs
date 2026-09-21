import { fixture as refund, id, as, json } from "./native-refund-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = refund(t);
  f.db.file("supabase/migrations/20260921144718_native_grocery_expense.sql");
  f.db.file("supabase/migrations/20260921160415_native_correction_command.sql");
  const payload = (patch = {}) => ({
    sourceEventId: f.source,
    expectedReversalId: null,
    replacement: null,
    ...patch,
  });
  return { ...f, payload };
}
export const replacement = (amount = "1200", own = "500") => ({
  kind: "expense",
  expense: {
    description: "Corrected expense",
    amountCentimes: amount,
    payerId: id(1),
    allocations: [
      { memberId: id(1), centimes: own },
      { memberId: id(2), centimes: String(BigInt(amount) - BigInt(own)) },
    ],
    date: "2026-09-21",
    note: "Retained correction note",
    categoryId: null,
  },
});
/** @param {number} operation @param {object} input @param {string | null} [approval] */
export function command(operation, input, approval = null) {
  return `select public.${approval ? "nest_execute_correction" : "nest_save_correction"}('${id(10)}','${id(operation)}',${json(input)}${approval ? `,'${approval}'` : ""})`;
}
export function approve(f, operation, input) {
  const approval = f.db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(operation)}','expenses.correct',1,${json(input)})`,
    ),
  );
  f.db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(operation)}','expenses.correct',1,${json(input)},true)`,
    ),
  );
  return approval;
}
