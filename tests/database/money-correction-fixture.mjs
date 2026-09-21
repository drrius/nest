import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id, expense } from "./money-expense-helpers.mjs";
export { as, id, counts } from "./money-expense-helpers.mjs";
export function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/money-expense-fixture.sql");
  for (const name of ["opening-correction-lineage", "refund-command", "correction-command"])
    db.file(`tests/database/legacy-money/${name}.sql`);
  for (const signature of [
    "public.post_refund(uuid,bigint,jsonb,date,text,text,text)",
    "public.correct_financial_event(uuid,text,jsonb)",
  ]) {
    db.sql(
      `revoke all on function ${signature} from public,anon,authenticated; grant execute on function ${signature} to authenticated`,
    );
  }
  const record = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
  const seed = (key, amount = 101, own = 51) =>
    record(expense(key, { amount, own })).financial_event_id;
  return { db, record, seed };
}
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const allocations = (own, other) => [
  { memberId: id(1), allocatedCents: own },
  { memberId: id(2), allocatedCents: other },
];
export const refund = (event, key, own, other) =>
  `select public.post_refund('${event}',${own + other},${json(allocations(own, other))},'2026-09-21','${key}','Refund',null)`;
export const correct = (event, key, replacement = null) =>
  `select public.correct_financial_event('${event}','${key}',${replacement === null ? "null" : json(replacement)})`;
export const replacement = (amount, own) => ({
  description: "Corrected expense",
  amount_cents: amount,
  payer_member_id: id(1),
  allocations: allocations(own, amount - own),
  occurred_on: "2026-09-21",
  category_id: null,
  note: "Corrected retained note",
  receipt_path: null,
});
export const balance = (db) =>
  BigInt(
    db.sql(
      `select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries where member_id='${id(1)}'`,
    ),
  );
