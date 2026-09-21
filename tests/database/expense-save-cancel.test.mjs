import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  as,
  id,
  payload,
  save,
  propose,
  execute,
  decide,
  count,
} from "./native-expense-helpers.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/money-expense-fixture.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260921114330_native_expense_command.sql",
  "supabase/migrations/20260921130419_native_expense_save_cancel.sql",
])
  db.file(file);
const cancel = (operation) =>
  `select public.nest_cancel_expense_save('${id(10)}','${id(operation)}')`;
const read = (operation) => `select public.nest_read_expense_save('${id(10)}','${id(operation)}')`;
const result = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
const markers = (operation) =>
  db.sql(
    `select count(*) from public.nest_expense_save_cancellations where operation_id='${id(operation)}'`,
  );
test("cancellation is durable and blocks late direct Saves while actor-bound reads stay private", async () => {
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
        `select count(*) from public.nest_expense_save_cancellations where actor_id='${id(1)}'`,
      ),
    ),
    "0",
  );
  assert.equal(db.sql(as(3, "select count(*) from public.nest_expense_save_cancellations")), "0");
  assert.throws(() => result(cancel(101), 3), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${cancel(101)}`), /permission denied/);
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `insert into public.nest_expense_save_cancellations values('${id(1)}','${id(10)}','${id(101)}',now())`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(`delete from public.nest_expense_save_cancellations where operation_id='${id(100)}'`),
    /append-only/,
  );
});
test("Save/cancel races converge to one durable outcome without reversing recorded history", async () => {
  for (let index = 0; index < 20; index++) {
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
  db.sql(`create function private.fail_save_cancel() returns trigger language plpgsql as $$ begin raise exception 'fixture cancellation failure'; end; $$;
    create trigger fail_save_cancel before insert on public.nest_expense_save_cancellations for each row execute function private.fail_save_cancel();`);
  try {
    assert.throws(() => result(cancel(400)), /fixture cancellation failure/);
    assert.equal(result(read(400)).status, "unresolved");
  } finally {
    db.sql(
      "drop trigger fail_save_cancel on public.nest_expense_save_cancellations; drop function private.fail_save_cancel()",
    );
  }
  const receipt = result(save(400));
  assert.equal(result(cancel(400)).status, "recorded");
  assert.deepEqual(result(read(400)).receipt, receipt);
});
test("a failed archived-category Save can be cancelled without category validation or a ledger write", () => {
  db.sql(
    `insert into public.expense_categories(id,household_id,name,sort_order,archived_at) values('${id(500)}','${id(10)}','Old',0,now())`,
  );
  const before = count(db),
    expense = payload({ categoryId: id(500) });
  assert.throws(() => result(save(500, expense)), /category unavailable/);
  assert.equal(result(cancel(500)).status, "cancelled");
  assert.throws(() => result(save(500, payload())), /Save cancelled/);
  assert.equal(count(db), before);
});
