import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, counts, expense, id } from "./money-expense-helpers.mjs";
import {
  equalAllocation,
  percentageAllocation,
} from "../../packages/domain/src/money/allocations.ts";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-expense-fixture.sql");

test("actual expense posts once under concurrent retries, preserving complete history and one notice", async () => {
  const before = JSON.parse(counts(db));
  const results = await Promise.all(
    Array.from({ length: 8 }, () => db.concurrent(as(1, expense("race")))),
  );
  const events = results.map(({ stdout }) => JSON.parse(stdout.trim()).financial_event_id);
  assert.equal(new Set(events).size, 1);
  assert.deepEqual(
    JSON.parse(counts(db)).map((count, n) => count - before[n]),
    [1, 2, 2, 1, 1, 1, 1],
  );
  assert.equal(
    db.sql(
      `select string_agg(receivable_delta_cents::text,',' order by member_id) from public.ledger_entries where financial_event_id='${events[0]}'`,
    ),
    "50,-50",
  );
  assert.equal(
    db.sql(`select note from public.financial_events where id='${events[0]}'`),
    "Retained note",
  );
  assert.equal(
    db.sql(`select status from public.push_outbox order by created_at limit 1`),
    "skipped_no_subscription",
  );
  assert.throws(() => db.sql(as(1, expense("race", { amount: 103 }))), /different command/);
  assert.throws(
    () => db.sql("update public.money_command_receipts set result='{}'"),
    /append-only/,
  );
});

test("unauthorized callers, incomplete allocations and invalid payer cannot append any side effects", () => {
  const before = counts(db);
  assert.throws(() => db.sql(as(3, expense("outsider"))), /not a member/);
  assert.throws(() => db.sql("set role anon; " + expense("anonymous")), /permission denied/);
  assert.throws(() => db.sql(as(3, expense("one-member", { household: 20 }))), /exactly two/);
  assert.throws(
    () => db.sql(as(1, expense("foreign-payer", { payer: 3 }))),
    /both household|foreign key/,
  );
  for (const shares of [
    [],
    [{ memberId: id(1), allocatedCents: 101 }],
    [
      { memberId: id(1), allocatedCents: 51 },
      { memberId: id(1), allocatedCents: 50 },
    ],
    [
      { memberId: id(1), allocatedCents: 51 },
      { memberId: id(2), allocatedCents: 49 },
    ],
    [
      { memberId: id(1), allocatedCents: null },
      { memberId: id(2), allocatedCents: 101 },
    ],
  ]) {
    assert.throws(() => db.sql(as(1, expense("invalid", { allocations: shares }))));
  }
  assert.equal(counts(db), before);
  assert.equal(db.sql(as(3, "select count(*) from public.money_command_receipts")), "0");
  assert.throws(
    () => db.sql(as(1, `select private.lock_household_ledger('${id(10)}')`)),
    /permission denied/,
  );
});

test("notice failure rolls back ledger, allocations, activity and receipt; the same key then succeeds", () => {
  const before = counts(db);
  db.sql(
    "alter table public.push_outbox add constraint fixture_fail check (status = 'failed') not valid",
  );
  try {
    assert.throws(() => db.sql(as(2, expense("rollback"))), /fixture_fail/);
    assert.equal(counts(db), before);
  } finally {
    db.sql("alter table public.push_outbox drop constraint fixture_fail");
  }
  const event = JSON.parse(db.sql(as(2, expense("rollback")))).financial_event_id;
  assert.equal(
    db.sql(`select created_by_member_id from public.financial_events where id='${event}'`),
    id(2),
  );
  assert.equal(
    db.sql(`select recipient_member_id from public.inbox_notifications where entity_id='${event}'`),
    id(1),
  );
});

test("audit exposes household-wide legacy retry identity that the native actor-bound wrapper must isolate", () => {
  const first = JSON.parse(db.sql(as(1, expense("shared-key"))));
  const before = counts(db);
  assert.deepEqual(JSON.parse(db.sql(as(2, expense("shared-key")))), first);
  assert.equal(counts(db), before);
  assert.equal(
    db.sql(
      `select created_by_member_id from public.financial_events where id='${first.financial_event_id}'`,
    ),
    id(1),
  );
});

test("actual engine preserves exact domain splits for 160 generated amounts including zero and safe endpoints", () => {
  for (let offset = 0; offset < 160; offset += 10) {
    const commands = [];
    for (let n = offset; n < offset + 10; n++) {
      const amount = n === 0 ? 0 : n === 1 ? Number.MAX_SAFE_INTEGER : n * 7919 + 1;
      const payer = (n % 2) + 1;
      const shares =
        n % 3 === 0
          ? equalAllocation(amount, id(payer), id(payer === 1 ? 2 : 1))
          : percentageAllocation(amount, id(payer), id(payer === 1 ? 2 : 1), (n * 631) % 10001);
      commands.push(expense(`vector-${n}`, { amount, payer, own: shares[0].centimes }) + ";");
    }
    db.sql(as(1, commands.join("\n")));
  }
  assert.equal(
    db.sql(
      `select count(*) from public.money_command_receipts where idempotency_key like 'vector-%'`,
    ),
    "160",
  );
  assert.equal(
    db.sql(`select count(*) from public.financial_events e where
    (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2 or
    (select sum(l.receivable_delta_cents) from public.ledger_entries l where l.financial_event_id=e.id)<>0 or
    (select sum(a.allocated_cents) from public.financial_allocations a where a.financial_event_id=e.id)<>e.amount_cents or
    (select l.receivable_delta_cents from public.ledger_entries l where l.financial_event_id=e.id and l.member_id=e.payer_member_id)<>
    e.amount_cents-(select a.allocated_cents from public.financial_allocations a where a.financial_event_id=e.id and a.member_id=e.payer_member_id)`),
    "0",
  );
});

async function waiting(application, event) {
  for (let n = 0; n < 100; n++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and wait_event='${event}'`,
      ) === "1"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error(`Fixture did not reach ${application}/${event}`);
}
test("expense posting waits on the same household ledger lock as legacy corrections", async () => {
  const before = counts(db);
  const holder = db.concurrent(
    `set application_name='expense-holder'; begin; select private.lock_household_ledger('${id(10)}'); select pg_sleep(1); commit;`,
  );
  await waiting("expense-holder", "PgSleep");
  const writer = db.concurrent(
    `set application_name='expense-writer'; ${as(1, expense("ledger-lock"))}`,
  );
  await waiting("expense-writer", "advisory");
  assert.equal(counts(db), before);
  await Promise.all([holder, writer]);
  assert.equal(
    db.sql(
      "select count(*) from public.money_command_receipts where idempotency_key='ledger-lock'",
    ),
    "1",
  );
});
