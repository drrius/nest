import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, counts, expense, id } from "./money-expense-helpers.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-expense-fixture.sql");
db.file("tests/database/legacy-money/settlement-command.sql");
const settle = (key, amount, mode = "partial", payer = 2) =>
  `select public.record_settlement('${id(10)}','${id(payer)}',${amount},'2026-09-21','Synthetic settlement','${key}',null,'${mode}')`;
const seed = (key, amount) => db.sql(as(1, expense(key, { amount, own: 0 })));
const balance = () =>
  db.sql(
    `select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries where member_id='${id(1)}'`,
  );
const event = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql))).financial_event_id;
test("actual partial/full settlement preserves zero-sum history; full mode derives the live amount rather than trusting displayed input", () => {
  seed("partial-seed", 1001);
  const partial = event(settle("partial", 300));
  assert.equal(balance(), "701");
  assert.equal(
    db.sql(`select amount_cents from public.financial_events where id='${partial}'`),
    "300",
  );
  const full = event(settle("full", 1, "full"));
  assert.equal(balance(), "0");
  assert.equal(
    db.sql(`select amount_cents from public.financial_events where id='${full}'`),
    "701",
  );
  assert.throws(() => event(settle("already", 1, "full")), /already settled/);
  assert.throws(
    () => db.sql(`delete from public.financial_events where id='${partial}'`),
    /append-only/,
  );
  const before = counts(db);
  assert.equal(event(settle("full", 1, "full"), 2), full);
  assert.equal(counts(db), before);
});
test("same-key concurrent settlement retries append one event, two ledger deltas and one actual partner notice", async () => {
  seed("retry-seed", 500);
  const before = JSON.parse(counts(db));
  const values = await Promise.all(
    Array.from({ length: 8 }, () => db.concurrent(as(1, settle("retry", 500, "full")))),
  );
  assert.equal(new Set(values.map((value) => JSON.parse(value.stdout).financial_event_id)).size, 1);
  assert.deepEqual(
    JSON.parse(counts(db)).map((value, index) => value - before[index]),
    [1, 0, 2, 1, 1, 1, 1],
  );
  assert.equal(balance(), "0");
  await assert.rejects(db.concurrent(as(1, settle("retry", 501, "full"))), (error) =>
    /different command/.test(error.stderr),
  );
});
test("foreign actor, wrong payer and overpayment cannot post; notice failure rolls the entire settlement back", () => {
  seed("failure-seed", 500);
  const before = counts(db);
  assert.throws(() => event(settle("outsider", 100), 3), /not a member/);
  assert.throws(() => db.sql("set role anon; " + settle("anon", 100)), /permission denied/);
  assert.throws(() => event(settle("wrong-payer", 100, "partial", 1)), /does not currently owe/);
  for (const amount of [0, -1, 501, "null"])
    assert.throws(() => event(settle("invalid", amount)), /within the current balance/);
  assert.equal(counts(db), before);
  db.sql(
    "alter table public.push_outbox add constraint fixture_settlement_failure check(status='failed') not valid",
  );
  try {
    assert.throws(() => event(settle("rollback", 500, "full")), /fixture_settlement_failure/);
    assert.equal(counts(db), before);
  } finally {
    db.sql("alter table public.push_outbox drop constraint fixture_settlement_failure");
  }
  event(settle("rollback", 500, "full"));
  assert.equal(balance(), "0");
});
test("different full-settlement operations serialize against the same live ledger and cannot reverse the balance", async () => {
  seed("distinct-seed", 701);
  const values = await Promise.allSettled([
    db.concurrent(as(1, settle("distinct-a", 701, "full"))),
    db.concurrent(as(2, settle("distinct-b", 701, "full"))),
  ]);
  assert.equal(values.filter((value) => value.status === "fulfilled").length, 1);
  assert.match(
    values.find((value) => value.status === "rejected").reason.stderr,
    /already settled/,
  );
  assert.equal(balance(), "0");
});
test("generated partial/full settlement sequences reconcile through the safe centime endpoint without changing retained expenses", () => {
  for (let index = 0; index < 64; index++) {
    const amount = index === 0 ? Number.MAX_SAFE_INTEGER : index * 7919 + 1,
      partial = Math.max(1, Math.floor(amount / 3));
    db.sql(
      as(
        1,
        `${expense(`vector-expense-${index}`, { amount, own: 0 })};${settle(`vector-partial-${index}`, partial)};${settle(`vector-full-${index}`, 1, "full")};`,
      ),
    );
    assert.equal(balance(), "0");
  }
  assert.equal(
    db.sql(
      `select count(*) from public.money_command_receipts r join public.financial_events e on e.id=(r.result->>'financial_event_id')::uuid where r.idempotency_key like 'vector-expense-%' and e.amount_cents::text<>r.request_payload->>'amount_cents'`,
    ),
    "0",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.financial_events e where (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2 or (select sum(receivable_delta_cents) from public.ledger_entries l where l.financial_event_id=e.id)<>0`,
    ),
    "0",
  );
});
