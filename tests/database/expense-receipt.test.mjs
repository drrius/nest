import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id } from "./expense-receipt-fixture.mjs";
import { payload, save } from "./native-expense-helpers.mjs";
import { replacement, command as correct } from "./native-correction-fixture.mjs";
test("concurrent native Saves claim one exact receipt and preserve financial and grocery values", async (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  const input = payload({ receiptPath: path, receiptTotalCentimes: "500" });
  const replies = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(save(200, input)))),
  );
  const result = JSON.parse(replies[0].stdout);
  for (const reply of replies) assert.deepEqual(JSON.parse(reply.stdout), result);
  assert.deepEqual(result.expense, input);
  assert.equal(f.state(path), "claimed");
  assert.equal(
    f.db.sql(`select receipt_path from public.financial_events where id='${result.eventId}'`),
    path,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(f.db.sql(as(f.cleanup(path))), "");
  assert.throws(() => f.read(save(200, payload())), /operation changed/);
});
test("pending-only AI receipt approval and receipt failure rollback preserve exact reviewed binding", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  const input = payload({ receiptPath: path }),
    turn = f.start();
  const result = f.propose(turn, input),
    approval = result.value.approval;
  assert.equal(approval.status, "pending");
  assert.equal(f.state(path), "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  f.db.sql(
    "alter table public.nest_expense_receipts add constraint fail_receipt check(false) not valid",
  );
  assert.throws(() => f.read(f.decide(approval)), /fail_receipt/);
  assert.equal(f.state(path), "pending");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval.id}'`),
    "pending",
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  f.db.sql("alter table public.nest_expense_receipts drop constraint fail_receipt");
  assert.throws(() => f.read(f.decide({ ...approval, expense: payload() })), /changed/);
  const recorded = f.read(f.decide(approval));
  assert.equal(recorded.approval.status, "consumed");
  assert.equal(f.state(path), "claimed");
  assert.deepEqual(f.propose(turn, input), result);
});
test("wrong tenant, missing bytes, malformed paths and cleanup state cannot become financial receipts", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  for (const receiptPath of [
    null,
    1,
    "",
    path.toUpperCase(),
    path.replace("/receipts/", "/documents/"),
    f.path(999),
    f.path(999, 20),
    `../${path}`,
  ])
    assert.throws(() => f.read(save(200, payload({ receiptPath }))), /receipt|Receipt/);
  f.db.sql(as(f.cleanup(path)));
  assert.throws(() => f.read(save(200, payload({ receiptPath: path }))), /Receipt unavailable/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const ordinary = f.read(save(201));
  assert.equal(ordinary.expense.receiptPath, undefined);
});
test("correction preserves the claimed original receipt and rejects any replacement receipt shortcut", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  const source = f.read(save(200, payload({ receiptPath: path }))).eventId;
  const correction = {
    sourceEventId: source,
    expectedReversalId: null,
    replacement: replacement(),
  };
  assert.throws(
    () =>
      f.read(
        correct(201, {
          ...correction,
          replacement: {
            kind: "expense",
            expense: { ...replacement().expense, receiptPath: path },
          },
        }),
      ),
    /retains original receipt/,
  );
  const result = f.read(correct(202, correction));
  assert.equal(
    f.db.sql(
      `select receipt_path from public.financial_events where id='${result.replacementEventId}'`,
    ),
    path,
  );
  assert.equal(f.state(path), "claimed");
});
test("native receipt Save and cleanup serialize without a posted missing attachment", async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 12; n++) {
    const path = f.path(300 + n);
    f.seed(path);
    const responses = await Promise.allSettled([
      f.db.concurrent(as(save(400 + n, payload({ receiptPath: path })))),
      f.db.concurrent(as(f.cleanup(path))),
    ]);
    assert.equal(responses[1].status, "fulfilled");
    if (responses[0].status === "fulfilled") {
      assert.equal(f.state(path), "claimed");
      assert.equal(responses[1].value.stdout.trim(), "");
    } else {
      assert.match(responses[0].reason.stderr, /Receipt unavailable|Attachment is unavailable/);
      assert.equal(f.state(path), "deleting");
    }
  }
});
