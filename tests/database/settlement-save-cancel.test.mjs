import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id, expense } from "./money-expense-helpers.mjs";
import { settlement as payload } from "../integration/settlement-api-fixture.mjs";
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const save = (operation, value = payload()) =>
  `select public.nest_save_settlement('${id(10)}','${id(operation)}',${json(value)})`;
const execute = (operation, approval) =>
  `select public.nest_execute_settlement('${id(10)}','${id(operation)}',${json(payload())},'${approval}')`;
const count = (db) => db.sql("select count(*) from public.financial_events");
const propose = (db, op) =>
  db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(op)}','settlements.record',1,${json(payload())})`,
    ),
  );
const decide = (db, op, approval) =>
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${approval}','${id(op)}','settlements.record',1,${json(payload())},true)`,
    ),
  );
let seeds = 0;
function ensureBalance() {
  const balance = db.sql(
    `select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries where member_id='${id(1)}'`,
  );
  if (balance === "0") db.sql(as(1, expense(`cancel-seed-${seeds++}`, { amount: 1000, own: 0 })));
  else assert.equal(balance, "1000");
}
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/money-expense-fixture.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "tests/database/legacy-money/settlement-command.sql",
  "supabase/migrations/20260921134717_native_settlement_command.sql",
  "supabase/migrations/20260921142513_native_settlement_save_cancel.sql",
])
  db.file(file);
const cancel = (operation) =>
  `select public.nest_cancel_settlement_save('${id(10)}','${id(operation)}')`;
const read = (operation) =>
  `select public.nest_read_settlement_save('${id(10)}','${id(operation)}')`;
const result = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
const markers = (operation) =>
  db.sql(
    `select count(*) from public.nest_settlement_save_cancellations where operation_id='${id(operation)}'`,
  );
test("cancellation is durable and blocks late direct Saves while actor-bound reads stay private", async () => {
  ensureBalance();
  const before = count(db);
  assert.equal(result(read(100)).status, "unresolved");
  const values = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(as(1, cancel(100)))),
  );
  for (const value of values) assert.equal(JSON.parse(value.stdout).status, "cancelled");
  assert.equal(markers(100), "1");
  assert.equal(result(read(100)).status, "cancelled");
  assert.throws(() => result(save(100)), /Save cancelled/);
  assert.throws(
    () => result(save(100, payload({ note: "Different late request" }))),
    /Save cancelled/,
  );
  assert.equal(count(db), before);
  assert.equal(result(read(100), 2).status, "unresolved");
  assert.equal(result(save(100), 2).actorId, id(2));
  assert.equal(
    db.sql(
      as(
        2,
        `select count(*) from public.nest_settlement_save_cancellations where actor_id='${id(1)}'`,
      ),
    ),
    "0",
  );
  assert.equal(
    db.sql(as(3, "select count(*) from public.nest_settlement_save_cancellations")),
    "0",
  );
  assert.throws(() => result(cancel(101), 3), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${cancel(101)}`), /permission denied/);
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `insert into public.nest_settlement_save_cancellations values('${id(1)}','${id(10)}','${id(101)}',now())`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        `delete from public.nest_settlement_save_cancellations where operation_id='${id(100)}'`,
      ),
    /append-only/,
  );
});
test("Save/cancel races converge to one durable outcome without reversing recorded history", async () => {
  for (let index = 0; index < 20; index++) {
    ensureBalance();
    const operation = 200 + index,
      before = Number(count(db));
    const outcomes = await Promise.allSettled([
      db.concurrent(as(1, save(operation))),
      db.concurrent(as(1, cancel(operation))),
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    const state = result(read(operation));
    if (state.status === "recorded") {
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(Number(count(db)), before + 1);
      assert.equal(markers(operation), "0");
      assert.deepEqual(result(cancel(operation)), state);
      assert.deepEqual(result(save(operation)), state.receipt);
    } else {
      assert.equal(state.status, "cancelled");
      assert.equal(outcomes[0].status, "rejected");
      assert.match(outcomes[0].reason.stderr, /Save cancelled/);
      assert.equal(Number(count(db)), before);
      assert.equal(markers(operation), "1");
    }
  }
});
test("cancellation cannot authorize, deny or reverse the separate AI approval path", () => {
  ensureBalance();
  const approval = propose(db, 300);
  assert.equal(result(cancel(300)).status, "cancelled");
  assert.throws(() => result(execute(300, approval)), /approval|Approval/);
  decide(db, 300, approval);
  const receipt = result(execute(300, approval));
  assert.equal(receipt.approvalId, approval);
  assert.throws(() => result(cancel(300)), /Not a direct Save/);
  assert.throws(() => result(read(300)), /Not a direct Save/);
  assert.deepEqual(result(execute(300, approval)), receipt);
});
test("failed cancellation insertion does not claim cancellation and leaves a Save possible", () => {
  ensureBalance();
  db.sql(`create function private.fail_save_cancel() returns trigger language plpgsql as $$ begin raise exception 'fixture cancellation failure'; end; $$;
    create trigger fail_save_cancel before insert on public.nest_settlement_save_cancellations for each row execute function private.fail_save_cancel();`);
  try {
    assert.throws(() => result(cancel(400)), /fixture cancellation failure/);
    assert.equal(result(read(400)).status, "unresolved");
  } finally {
    db.sql(
      "drop trigger fail_save_cancel on public.nest_settlement_save_cancellations; drop function private.fail_save_cancel()",
    );
  }
  const receipt = result(save(400));
  assert.equal(result(cancel(400)).status, "recorded");
  assert.deepEqual(result(read(400)).receipt, receipt);
});
test("a stale-balance Save can be durably cancelled without changing the current ledger", () => {
  ensureBalance();
  db.sql(as(1, expense("stale-cancel", { amount: 50, own: 0 })));
  const before = count(db);
  assert.throws(() => result(save(500)), /balance changed/);
  assert.equal(result(cancel(500)).status, "cancelled");
  assert.throws(
    () =>
      result(save(500, payload({ amountCentimes: "1050", expectedOutstandingCentimes: "1050" }))),
    /Save cancelled/,
  );
  assert.equal(count(db), before);
});
