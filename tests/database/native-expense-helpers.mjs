import { as, id } from "./money-expense-helpers.mjs";
export { as, id };
export const payload = (patch = {}) => ({
  description: "Household expense",
  amountCentimes: "101",
  payerId: id(1),
  allocations: [
    { memberId: id(1), centimes: "51" },
    { memberId: id(2), centimes: "50" },
  ],
  date: "2026-09-21",
  categoryId: null,
  note: "Retained native note",
  ...patch,
});
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const save = (operation, value = payload()) =>
  `select public.nest_save_expense('${id(10)}','${id(operation)}',${json(value)})`;
export const execute = (operation, approval, value = payload()) =>
  `select public.nest_execute_expense('${id(10)}','${id(operation)}',${json(value)},${approval ? `'${approval}'` : "null"})`;
export function propose(db, operation, value = payload(), actor = 1) {
  return db.sql(
    as(
      actor,
      `select public.nest_propose_action('${id(10)}','${id(operation)}','expenses.record',1,${json(value)})`,
    ),
  );
}
export function decide(db, operation, approval, options = {}) {
  const { value = payload(), approved = true } = options;
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(operation)}','expenses.record',1,${json(value)},${approved})`,
    ),
  );
}
export const count = (db) => db.sql(`select count(*) from public.financial_events`);
