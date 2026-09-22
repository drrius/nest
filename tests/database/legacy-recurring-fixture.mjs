import { fixture as worker, id, as, json } from "./recurring-worker-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = worker(t);
  f.db.file("tests/database/legacy-recurring/rules.sql");
  f.db.file("tests/database/legacy-recurring/draft-columns.sql");
  f.db.file("supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql");
  const allocations = [
    { memberId: id(1), allocatedCents: 51 },
    { memberId: id(2), allocatedCents: 50 },
  ];
  const rule = (n = 800, active = true) =>
    f.db
      .sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,day_of_month,active,next_occurrence_on,updated_at)
    values('${id(n)}','${id(10)}','Legacy monthly expense',101,'${id(1)}',${json(allocations)},'monthly',31,${active},'2026-01-31','2026-01-01 10:00:00.123456+00')`);
  const draft = (n, status, due) =>
    f.db
      .sql(`insert into public.expense_drafts(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,occurred_on,status,recurring_expense_rule_id)
    values('${id(n)}','${id(10)}','Retained original draft',101,'${id(1)}',${json(allocations)},'${due}','${status}','${id(800)}')`);
  const post = (n) =>
    f.db.sql(
      `select private.post_financial_event('${id(10)}','${id(1)}','expense','${id(1)}','Legacy draft expense',101,${json(allocations)},(select occurred_on from public.expense_drafts where id='${id(n)}'),null,null,null,null,null,'${id(n)}',null)`,
    );
  /** @param {string|null} [after] @param {number} [home] */
  const query = (after = null, home = 10) =>
    `select public.nest_read_legacy_recurring('${id(home)}',${after === null ? "null" : `'${after}'`})`;
  const read = (after = null, actor = 1) => f.record(query(after), actor);
  return { ...f, rule, draft, post, query, read };
}
