import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json } from "./grocery-expense-fixture.mjs";
import { payload, save } from "./native-expense-helpers.mjs";
const grocery = (patch = {}) => payload({ receiptTotalCentimes: "500", ...patch });
const read = (f, sql, actor = id(1)) => JSON.parse(f.db.sql(as(sql, actor)));
test("explicit grocery total is retained once, shared amount alone posts and both members can read immutable detail", async (t) => {
  const f = fixture(t),
    input = grocery();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(save(100, input)))),
  );
  const values = responses.map(({ stdout }) => JSON.parse(stdout));
  assert.equal(new Set(values.map((value) => value.eventId)).size, 1);
  const event = values[0].eventId;
  assert.deepEqual(values[0].expense, input);
  assert.equal(f.db.sql("select count(*) from public.nest_grocery_expenses"), "1");
  assert.equal(
    f.db.sql(`select amount_cents from public.financial_events where id='${event}'`),
    "101",
  );
  assert.equal(
    f.db.sql(
      `select sum(receivable_delta_cents) from public.ledger_entries where financial_event_id='${event}'`,
    ),
    "0",
  );
  for (const actor of [id(1), id(2)]) {
    const detail = read(f, `select public.nest_money_detail('${id(10)}','${event}')`, actor);
    assert.equal(detail.receiptTotalCentimes, "500");
    assert.equal(detail.event.amountCentimes, "101");
    assert.equal(detail.event.hasReceipt, false);
  }
  assert.equal(f.db.sql(as("select count(*) from public.nest_grocery_expenses", id(3))), "0");
  assert.throws(
    () => f.db.sql("update public.nest_grocery_expenses set receipt_total_cents=600"),
    /append-only/,
  );
  assert.throws(() => f.db.sql("delete from public.nest_grocery_expenses"), /append-only/);
  assert.throws(
    () =>
      f.db.sql(
        as("insert into public.nest_grocery_expenses select * from public.nest_grocery_expenses"),
      ),
    /permission denied/,
  );
  assert.throws(
    () => read(f, save(100, grocery({ receiptTotalCentimes: "600" }))),
    /operation changed/,
  );
});
test("total validation and authorization reject invalid inputs before posting and preserve ordinary expense compatibility", (t) => {
  const f = fixture(t);
  for (const value of [null, 500, "100", "-1", "1e3", "9007199254740992", "0500", "NaN"])
    assert.throws(
      () => read(f, save(100, grocery({ receiptTotalCentimes: value }))),
      /grocery|Shared amount/,
    );
  assert.throws(() => read(f, save(100, grocery()), id(3)), /Not authorized/);
  assert.throws(() => f.db.sql("set role anon; " + save(100, grocery())), /permission denied/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const ordinary = read(f, save(100));
  assert.equal(ordinary.expense.receiptTotalCentimes, undefined);
  assert.equal(
    read(f, `select public.nest_money_detail('${id(10)}','${ordinary.eventId}')`)
      .receiptTotalCentimes,
    null,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_grocery_expenses"), "0");
});
test("grocery metadata failure rolls back ledger, notice and approval consumption; exact retry commits all", (t) => {
  const f = fixture(t),
    turn = f.start();
  const proposal = f.execute(turn, grocery()).value.approval;
  const command = `select public.nest_decide_expense('${id(10)}','${proposal.operationId}',${json(proposal.expense)},'${proposal.id}',true)`;
  f.db.sql(
    "alter table public.nest_grocery_expenses add constraint fixture_fail check(false) not valid",
  );
  assert.throws(() => read(f, command), /fixture_fail/);
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${proposal.id}'`),
    "pending",
  );
  for (const table of [
    "financial_events",
    "ledger_entries",
    "financial_allocations",
    "nest_grocery_expenses",
    "nest_expense_receipts",
    "push_outbox",
  ])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  f.db.sql("alter table public.nest_grocery_expenses drop constraint fixture_fail");
  const result = read(f, command);
  assert.equal(result.approval.status, "consumed");
  assert.deepEqual(read(f, command), result);
  assert.equal(f.db.sql("select count(*) from public.nest_grocery_expenses"), "1");
});
test("AI approval binds receipt total and shared amount, and cancellation still blocks direct Save", (t) => {
  const f = fixture(t),
    turn = f.start();
  const proposal = f.execute(turn, grocery()).value.approval;
  assert.equal(proposal.expense.receiptTotalCentimes, "500");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const changed = { ...proposal.expense, receiptTotalCentimes: "600" };
  assert.throws(
    () =>
      read(
        f,
        `select public.nest_decide_expense('${id(10)}','${proposal.operationId}',${json(changed)},'${proposal.id}',true)`,
      ),
    /changed|mismatch|match/,
  );
  assert.throws(() => f.execute(turn, changed), /command changed/);
  assert.throws(
    () => read(f, `select public.nest_read_expense_approval('${id(10)}','${proposal.id}')`, id(2)),
    /unavailable|Not authorized/,
  );
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${proposal.id}'`),
    "pending",
  );
  read(f, `select public.nest_cancel_expense_save('${id(10)}','${id(800)}')`);
  assert.throws(() => read(f, save(800, grocery())), /cancelled/);
});

test("zero and maximum-safe totals remain exact and the retained ordinary shared amount is never replaced", (t) => {
  const f = fixture(t);
  for (const [index, amount] of ["0", "9007199254740991"].entries()) {
    const input = grocery({
      receiptTotalCentimes: "9007199254740991",
      amountCentimes: amount,
      allocations: [
        { memberId: id(1), centimes: amount },
        { memberId: id(2), centimes: "0" },
      ],
    });
    const result = read(f, save(400 + index, input));
    const detail = read(f, `select public.nest_money_detail('${id(10)}','${result.eventId}')`);
    assert.equal(detail.receiptTotalCentimes, "9007199254740991");
    assert.equal(detail.event.amountCentimes, amount);
    assert.equal(
      detail.shares.reduce((sum, share) => sum + BigInt(share.deltaCentimes), 0n),
      0n,
    );
  }
});

test("checking a grocery never posts money and explicitly recording money never checks groceries", (t) => {
  const f = fixture(t);
  f.db.file("tests/database/meal-move-grocery-fixture.sql");
  f.db.file("supabase/migrations/20260919214311_native_grocery_check_receipts.sql");
  f.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(700)}','${id(10)}','Milk'),('${id(701)}','${id(10)}','Apples')`,
  );
  read(f, `select public.nest_set_grocery_checked('${id(10)}','${id(710)}','${id(700)}',1,true)`);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_grocery_expenses"), "0");
  const before = f.db.sql("select jsonb_agg(to_jsonb(g) order by id) from public.grocery_items g");
  read(f, save(100, grocery()));
  assert.equal(
    f.db.sql("select jsonb_agg(to_jsonb(g) order by id) from public.grocery_items g"),
    before,
  );
});
