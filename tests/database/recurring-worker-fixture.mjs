import { fixture as manual, id, as, json } from "./recurring-manual-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = manual(t);
  f.db.sql("grant usage on schema public,private to service_role");
  f.db.file("supabase/migrations/20260922001213_native_recurring_worker_boundary.sql");
  const rule = f.rule(),
    saved = f.record(`select public.nest_save_recurring('${id(10)}','${id(600)}',${json(rule)})`);
  const input = {
    householdId: id(10),
    ruleId: rule.ruleId,
    revision: saved.revision,
    dueOn: f.today,
  };
  const job = (n = 700, value = input) =>
    `select public.nest_execute_fixed_job('${id(n)}',${json(value)})`;
  const scan = (limit = 100, after = null) =>
    `select public.nest_due_fixed_jobs(${limit},${after === null ? "null" : json(after)})`;
  const worker = (sql) => `set role service_role; ${sql}`;
  const execute = (sql) => JSON.parse(f.db.sql(worker(sql)));
  return { ...f, input, job, scan, worker, execute };
}
