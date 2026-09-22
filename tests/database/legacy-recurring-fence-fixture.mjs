import { fixture as legacy, id, as, json } from "./legacy-recurring-fixture.mjs";
export { id, as, json };
export function fixture(t) {
  const f = legacy(t);
  // Restore the audited legacy ID default omitted by the minimal read fixture.
  f.db.sql(
    "alter table public.expense_drafts alter column id set default extensions.gen_random_uuid()",
  );
  for (const file of ["next-date.sql", "generate-drafts.sql", "set-active.sql"])
    f.db.file(`tests/database/legacy-recurring/${file}`);
  f.db.file("tests/database/legacy-money/draft-confirmation.sql");
  f.db.file("supabase/migrations/20260922033013_native_legacy_recurring_fences.sql");
  f.rule();
  f.draft(900, "pending", "2026-01-31");
  const configuration = JSON.parse(
    f.db.sql(`select configuration from public.nest_recurring_rules where id='${id(300)}'`),
  );
  const rule = { ruleId: id(800), expectedRevision: null, configuration, firstDueOn: f.today };
  const native = f.record(
    `select public.nest_save_recurring('${id(10)}','${id(801)}',${json(rule)})`,
  );
  const key = `hashtextextended('nest:legacy-adoption:${id(10)}:${id(800)}',0)`;
  // Privileged fixture seed only: the future authorized adoption command must
  // additionally reconcile drafts, bind reviewed configuration and validate start/coverage.
  const adoptSql = `select pg_advisory_xact_lock(${key});
    update public.recurring_expense_rules set active=false where id='${id(800)}';
    insert into private.nest_legacy_recurring_adoptions(household_id,legacy_rule_id,native_rule_id,source_review_token,authorized_by)
    values('${id(10)}','${id(800)}','${id(800)}','${"0".repeat(64)}','${id(1)}')`;
  const adopt = () => f.db.sql(`begin; ${adoptSql}; commit`);
  const generate = `select private.generate_due_recurring_drafts_for_household('${id(10)}','${id(1)}','2026-02-28')`;
  return { ...f, rule, native, key, adoptSql, adopt, generate };
}
export async function sleeping(db, name) {
  const deadline = Date.now() + 5000;
  while (
    db.sql(
      `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`,
    ) !== "1"
  ) {
    if (Date.now() > deadline)
      throw Error("Fixture transaction did not reach its synchronization point");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
