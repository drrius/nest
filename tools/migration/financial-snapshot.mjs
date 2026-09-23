// Caller supplies a read-only SQL executor. This module never opens a connection.
const retainedTables = ["financial_events", "financial_allocations", "ledger_entries"];

export function captureFinancialSnapshot(sql) {
  const tables = retainedTables
    .map(
      (table) => `'${table}', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'digest',
      encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex')) order by id), '[]')
    from public.${table} t
  )`,
    )
    .join(",");
  // One statement gives all retained rows and balances the same MVCC snapshot.
  const snapshot = JSON.parse(
    sql(`select jsonb_build_object(
    'completeVisibility', (select rolsuper or rolbypassrls from pg_roles where rolname=current_user),
    'version', 1, 'tables', jsonb_build_object(${tables}),
    'balances', (select coalesce(jsonb_agg(to_jsonb(t) order by household_id, member_id), '[]') from (
      select household_id, member_id, sum(receivable_delta_cents)::text as centimes
      from public.ledger_entries group by household_id, member_id
    ) t),
    'invalidEvents', (select count(*)::text from public.financial_events e where
      (select count(*) from public.ledger_entries l where l.household_id=e.household_id and l.financial_event_id=e.id) <> 2
      or (select sum(receivable_delta_cents) from public.ledger_entries l where l.household_id=e.household_id and l.financial_event_id=e.id) <> 0)
  )`),
  );
  if (snapshot.completeVisibility !== true)
    throw new Error("Reconciliation requires a role with complete RLS visibility");
  return snapshot;
}

export function reconcileFinancialSnapshots(before, after) {
  const failures = [];
  if (!validMetadata(before) || !validMetadata(after))
    return { passed: false, failures: [{ invariant: "complete-versioned-snapshot" }] };
  for (const table of retainedTables) {
    const source = before.tables[table],
      target = after.tables[table];
    const current = new Map(target.map((row) => [row.id, row.digest]));
    const missing = source.filter((row) => !current.has(row.id)).length;
    const changed = source.filter(
      (row) => current.has(row.id) && current.get(row.id) !== row.digest,
    ).length;
    const original = new Set(source.map((row) => row.id));
    const added = target.filter((row) => !original.has(row.id)).length;
    if (missing || changed || added) failures.push({ table, missing, changed, added });
  }
  if (JSON.stringify(before.balances) !== JSON.stringify(after.balances))
    failures.push({ invariant: "exact-member-balances" });
  if (before.invalidEvents !== "0" || after.invalidEvents !== "0")
    failures.push({ invariant: "two-member-zero-sum-events" });
  return { passed: failures.length === 0, failures };
}

function validMetadata(snapshot) {
  return snapshot?.version === 1 && snapshot.completeVisibility === true;
}
