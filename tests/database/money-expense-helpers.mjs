export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
export function expense(key, options = {}) {
  const { amount = 101, payer = 1, own = 51, household = 10, allocations } = options;
  const shares = allocations ?? [
    { memberId: id(payer), allocatedCents: own },
    { memberId: id(payer === 1 ? 2 : 1), allocatedCents: amount - own },
  ];
  return `select public.post_manual_expense('${id(household)}','Synthetic expense',${amount},'${id(payer)}',
    '${JSON.stringify(shares)}'::jsonb,'2026-09-21','${key}',null,'Retained note',null)`;
}
export function counts(db) {
  return db.sql(`select json_build_array(
    (select count(*) from public.financial_events),
    (select count(*) from public.financial_allocations),
    (select count(*) from public.ledger_entries),
    (select count(*) from public.money_command_receipts),
    (select count(*) from public.activity_events),
    (select count(*) from public.inbox_notifications),
    (select count(*) from public.push_outbox))`);
}
