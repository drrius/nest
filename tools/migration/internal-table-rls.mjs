import assert from "node:assert/strict";

export const internalRLSTables = [
  "nest_recurring_job_receipts",
  "nest_legacy_draft_operations",
  "nest_legacy_confirmation_operations",
  "nest_legacy_recurring_adoptions",
  "nest_legacy_adoption_operations",
  "nest_renewal_operations",
  "nest_recurring_sweep",
  "nest_recurring_runs",
  "nest_recurring_execution_control",
  "nest_legacy_job_control",
];

export function verifyInternalTableRLS(db) {
  const names = internalRLSTables.map((name) => `'${name}'`).join(",");
  const rows = JSON.parse(
    db.sql(`select jsonb_agg(jsonb_build_object(
    'table',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
    'policies',(select count(*) from pg_policy p where p.polrelid=c.oid),
    'anonymous',has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE')
      or has_table_privilege('anon',c.oid,'DELETE,TRUNCATE'),
    'authenticated',has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE')
      or has_table_privilege('authenticated',c.oid,'DELETE,TRUNCATE')) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind in ('r','p') and c.relname in (${names})`),
  );
  assert.deepEqual(
    rows.map((row) => row.table),
    [...internalRLSTables].sort(),
  );
  for (const row of rows) {
    assert.equal(row.rls, true);
    assert.equal(row.forced, false);
    assert.equal(row.policies, 0);
    assert.equal(row.anonymous, false);
    assert.equal(row.authenticated, false);
  }
  return { passed: true, clientGrantsAdded: false, policiesAdded: false, tables: rows };
}
