import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  as,
  id,
  payload,
  save,
  execute,
  propose,
  decide,
  count,
} from "./native-expense-helpers.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/money-expense-fixture.sql");
db.file("supabase/migrations/20260919213407_native_action_approvals.sql");
db.file("supabase/migrations/20260921114330_native_expense_command.sql");
const result = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
const state = (approval) =>
  db.sql(`select status from public.nest_action_approvals where id='${approval}'`);

test("native expense receipts bind actor and payload, replay concurrent requests and remain immutable", async () => {
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(as(1, save(100)))),
  );
  const values = responses.map(({ stdout }) => JSON.parse(stdout.trim()));
  assert.equal(new Set(values.map((value) => value.eventId)).size, 1);
  assert.deepEqual(values[0], {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    eventId: values[0].eventId,
    approvalId: null,
    expense: payload(),
  });
  assert.throws(() => result(save(100, payload({ description: "Changed" }))), /operation changed/);
  const partner = result(save(100), 2);
  assert.notEqual(partner.eventId, values[0].eventId);
  assert.equal(partner.actorId, id(2));
  assert.equal(db.sql(as(3, "select count(*) from public.nest_expense_receipts")), "0");
  assert.equal(
    db.sql(
      as(2, "select count(*) from public.nest_expense_receipts where actor_id='" + id(1) + "'"),
    ),
    "0",
  );
  assert.throws(() => db.sql("delete from public.nest_expense_receipts"), /append-only/);
  assert.throws(() => result(save(101), 3), /Not authorized/);
  assert.throws(() => db.sql("set role anon; " + save(101)), /permission denied/);
  assert.throws(
    () => db.sql(as(1, `select private.nest_record_expense('${id(10)}','${id(101)}','{}',null)`)),
    /permission denied/,
  );
});

test("approved expense atomically consumes exact approval and replays after expiry without reposting", async () => {
  const approval = propose(db, 200);
  assert.throws(() => result(execute(200, approval)), /Approval not valid/);
  assert.equal(state(approval), "pending");
  decide(db, 200, approval);
  const before = Number(count(db));
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => db.concurrent(as(1, execute(200, approval)))),
  );
  const values = responses.map(({ stdout }) => JSON.parse(stdout.trim()));
  assert.equal(new Set(values.map((value) => value.eventId)).size, 1);
  assert.equal(Number(count(db)), before + 1);
  assert.equal(state(approval), "consumed");
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  assert.deepEqual(result(execute(200, approval)), values[0]);
  assert.throws(() => result(save(200)), /operation changed/);
  assert.throws(() => result(execute(201, approval)), /Approval not valid/);
  assert.equal(Number(count(db)), before + 1);
});

test("missing, denied, expired, foreign, edited and differently bound approvals never write", () => {
  const before = count(db);
  assert.throws(() => result(execute(300, null)), /approval required/);
  const denied = propose(db, 301);
  decide(db, 301, denied, { approved: false });
  assert.throws(() => result(execute(301, denied)), /Approval not valid/);
  const expired = propose(db, 302);
  decide(db, 302, expired);
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${expired}'`,
  );
  assert.throws(() => result(execute(302, expired)), /Approval not valid/);
  const approved = propose(db, 303);
  decide(db, 303, approved);
  assert.throws(() => result(execute(303, approved), 2), /Not authorized/);
  assert.throws(() => result(execute(304, approved)), /Approval not valid/);
  assert.throws(
    () => result(execute(303, approved, payload({ description: "Changed" }))),
    /Approval not valid/,
  );
  assert.equal(state(approved), "approved");
  assert.equal(count(db), before);
});

test("failed native receipt insertion rolls back consumed approval and every actual expense side effect", () => {
  const approval = propose(db, 400);
  decide(db, 400, approval);
  const before = db.sql(
    `select json_build_array((select count(*) from public.financial_events),(select count(*) from public.money_command_receipts),(select count(*) from public.activity_events),(select count(*) from public.inbox_notifications),(select count(*) from public.push_outbox))`,
  );
  db.sql(
    "alter table public.nest_expense_receipts add constraint fixture_receipt_fail check (false) not valid",
  );
  try {
    assert.throws(() => result(execute(400, approval)), /fixture_receipt_fail/);
    assert.equal(state(approval), "approved");
    assert.equal(
      db.sql(
        `select json_build_array((select count(*) from public.financial_events),(select count(*) from public.money_command_receipts),(select count(*) from public.activity_events),(select count(*) from public.inbox_notifications),(select count(*) from public.push_outbox))`,
      ),
      before,
    );
  } finally {
    db.sql("alter table public.nest_expense_receipts drop constraint fixture_receipt_fail");
  }
  const receipt = result(execute(400, approval));
  assert.equal(receipt.approvalId, approval);
  assert.equal(state(approval), "consumed");
});

test("strict direct RPC validation rejects malformed fields and allocation arithmetic without side effects", () => {
  const before = count(db);
  const invalid = [
    null,
    {},
    payload({ origin: "ui" }),
    payload({ amountCentimes: 101 }),
    payload({ amountCentimes: "01" }),
    payload({ amountCentimes: "9007199254740992" }),
    payload({ amountCentimes: "-1" }),
    payload({ date: "2026-02-30" }),
    payload({ date: "0000-01-01" }),
    payload({ date: "infinity" }),
    payload({ payerId: id(3) }),
    payload({ note: 1 }),
    payload({ allocations: null }),
    payload({ allocations: [{ memberId: id(1), centimes: "101" }] }),
    payload({
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: null },
      ],
    }),
    payload({
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: "49" },
      ],
    }),
  ];
  for (const value of invalid) assert.throws(() => result(save(500, value)));
  assert.equal(count(db), before);
  const zero = payload({
    amountCentimes: "0",
    allocations: [
      { memberId: id(1), centimes: "0" },
      { memberId: id(2), centimes: "0" },
    ],
  });
  assert.equal(result(save(501, zero)).expense.amountCentimes, "0");
  const maximum = payload({
    amountCentimes: "9007199254740991",
    allocations: [
      { memberId: id(1), centimes: "0" },
      { memberId: id(2), centimes: "9007199254740991" },
    ],
  });
  const receipt = result(save(502, maximum));
  assert.equal(
    db.sql(
      `select receivable_delta_cents from public.ledger_entries where financial_event_id='${receipt.eventId}' and member_id='${id(1)}'`,
    ),
    "9007199254740991",
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
test("approval expiry while waiting for the ledger lock prevents posting and consumption", async () => {
  const approval = propose(db, 600);
  decide(db, 600, approval);
  const before = count(db);
  const holder = db.concurrent(
    `set application_name='native-expense-holder'; begin; select private.lock_household_ledger('${id(10)}'); select pg_sleep(1); commit;`,
  );
  await waiting("native-expense-holder", "PgSleep");
  const writer = db
    .concurrent(`set application_name='native-expense-writer'; ${as(1, execute(600, approval))}`)
    .then(
      () => null,
      (error) => error,
    );
  await waiting("native-expense-writer", "advisory");
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${approval}'`,
  );
  await holder;
  assert.match(String(await writer), /Approval not valid/);
  assert.equal(count(db), before);
  assert.equal(state(approval), "approved");
});

test("category selection requires an active household category while a committed retry survives archive", () => {
  db.sql(`insert into public.expense_categories(id,household_id,name,sort_order) values
    ('${id(700)}','${id(10)}','Native fixture',0),('${id(701)}','${id(20)}','Foreign fixture',0)`);
  assert.throws(() => result(save(700, payload({ categoryId: id(701) }))), /category unavailable/);
  assert.throws(() => result(save(700, payload({ categoryId: id(799) }))), /category unavailable/);
  const value = payload({ categoryId: id(700) });
  const receipt = result(save(700, value));
  db.sql(`update public.expense_categories set archived_at=now() where id='${id(700)}'`);
  assert.deepEqual(result(save(700, value)), receipt);
  assert.throws(() => result(save(702, value)), /category unavailable/);
});
