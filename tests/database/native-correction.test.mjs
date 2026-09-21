import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { CorrectionInput, CorrectionReceipt } from "../../packages/contracts/src/correction.ts";
import { MoneyDetail } from "../../packages/contracts/src/money-detail.ts";
import { fixture, id, as, command, approve, replacement } from "./native-correction-fixture.mjs";
import { refund, balance } from "./money-correction-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
test("exact concurrent corrections append one reversal/replacement and isolate immutable receipts", async (t) => {
  const f = fixture(t),
    input = f.payload({ replacement: replacement() });
  assert.equal(Schema.is(CorrectionInput)(input), true);
  const original = f.db.sql(
    `select row_to_json(e) from public.financial_events e where id='${f.source}'`,
  );
  const results = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(1, command(100, input)))),
  );
  const receipt = JSON.parse(results[0].stdout);
  for (const r of results) assert.deepEqual(JSON.parse(r.stdout), receipt);
  assert.equal(Schema.is(CorrectionReceipt)(receipt), true);
  assert.equal(balance(f.db), 700n);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  assert.equal(
    f.db.sql(`select row_to_json(e) from public.financial_events e where id='${f.source}'`),
    original,
  );
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_correction_receipts")), "0");
  assert.throws(() => f.record(command(100, input), 2), /source changed/);
  assert.throws(() => f.record(command(100, { ...input, replacement: null })), /operation changed/);
  assert.throws(() => f.db.sql("delete from public.nest_correction_receipts"), /append-only/);
  assert.equal(
    Schema.is(CorrectionReceipt)({ ...receipt, replacementEventId: receipt.reversalEventId }),
    false,
  );
});
test("receipt and exact approval consumption roll back atomically; expired historical replay remains available", (t) => {
  const f = fixture(t),
    input = f.payload({ replacement: replacement() }),
    approval = approve(f, 100, input);
  f.db.sql(
    "alter table public.nest_correction_receipts add constraint fixture_failure check(false) not valid",
  );
  assert.throws(() => f.record(command(100, input, approval)), /fixture_failure/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  f.db.sql("alter table public.nest_correction_receipts drop constraint fixture_failure");
  assert.throws(() => f.record(command(100, { ...input, replacement: null }, approval)));
  const receipt = f.record(command(100, input, approval));
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  assert.deepEqual(f.record(command(100, input, approval)), receipt);
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "consumed",
  );
});
test("source restrictions, authority injection, wrong tenant and malformed replacements cannot post", (t) => {
  const f = fixture(t),
    input = f.payload();
  for (const patch of [
    { approved: true },
    { sourceEventId: id(999) },
    { sourceEventId: "bad" },
    { expectedReversalId: id(999) },
    { replacement: {} },
    { replacement: { ...replacement(), approved: true } },
    { replacement: { kind: "opening_balance", opening: {} } },
    {
      replacement: {
        kind: "expense",
        expense: { ...replacement().expense, amountCentimes: "1201" },
      },
    },
    {
      replacement: {
        kind: "expense",
        expense: { ...replacement().expense, receipt_path: "injected" },
      },
    },
  ])
    assert.throws(() => f.record(command(100, { ...input, ...patch })));
  assert.throws(() => f.record(command(100, input), 3), /Not authorized/);
  assert.throws(() => f.db.sql("set role anon; " + command(100, input)), /permission denied/);
  assert.throws(
    () =>
      f.db.sql(as(1, `select private.nest_record_correction('${id(10)}','${id(100)}','{}',null)`)),
    /permission denied/,
  );
  assert.throws(() => f.record(command(100, input, id(999))), /Not authorized/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  const receipt = f.record(command(101, input));
  assert.throws(
    () => f.record(command(102, f.payload({ sourceEventId: receipt.reversalEventId }))),
    /reversal events/,
  );
});
test("grocery replacement requires an explicit reviewed total and preserves retained receipt reference", (t) => {
  const f = fixture(t);
  const source = f.record(
    `select public.post_manual_expense('${id(10)}','Grocery',1000,'${id(1)}','[{"memberId":"${id(1)}","allocatedCents":400},{"memberId":"${id(2)}","allocatedCents":600}]','2026-09-21','receipt-source',null,null,'${id(10)}/receipt.jpg')`,
  ).financial_event_id;
  f.db.sql(`insert into public.nest_grocery_expenses values('${source}','${id(10)}',1800)`);
  const input = f.payload({ sourceEventId: source, replacement: replacement() });
  assert.throws(() => f.record(command(100, input)), /Review the grocery receipt total/);
  input.replacement.expense.receiptTotalCentimes = "1900";
  const result = f.record(command(101, input));
  const detail = f.record(
    `select public.nest_money_detail('${id(10)}','${result.replacementEventId}')`,
  );
  assert.equal(Schema.is(MoneyDetail)(detail), true);
  assert.equal(detail.receiptTotalCentimes, "1900");
  assert.equal(detail.event.hasReceipt, true);
  assert.equal(
    f.db.sql(
      `select receipt_path from public.financial_events where id='${result.replacementEventId}'`,
    ),
    `${id(10)}/receipt.jpg`,
  );
  assert.equal(
    f.db.sql(
      `select receipt_total_cents from public.nest_grocery_expenses where event_id='${source}'`,
    ),
    "1800",
  );
});
test("refund reversal restores allowance and races follow the same parent/source lock order", async (t) => {
  const f = fixture(t);
  const returned = f.record(refund(f.source, "refund", 100, 200)).financial_event_id;
  assert.throws(() => f.record(command(100, f.payload())), /active refunds/);
  const result = f.record(command(101, f.payload({ sourceEventId: returned })));
  assert.equal(Schema.is(CorrectionReceipt)(result), true);
  assert.equal(balance(f.db), 600n);
  for (let i = 0; i < 8; i++) {
    const source = f.seed(`race-${i}`, 1000, 400);
    const outcomes = await Promise.allSettled([
      f.db.concurrent(as(1, command(200 + i, f.payload({ sourceEventId: source })))),
      f.db.concurrent(as(2, refund(source, `race-refund-${i}`, 100, 200))),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.doesNotMatch(outcomes.find((r) => r.status === "rejected").reason.stderr, /deadlock/);
  }
});
test("opening corrections retain a single root and can repair a reviewed reversed leaf without forking", (t) => {
  const f = fixture(t);
  const source = f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Opening',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
  );
  const change = {
    kind: "opening_balance",
    opening: {
      description: "Corrected opening",
      amountCentimes: "200",
      payerId: id(2),
      date: "2026-09-01",
      note: null,
    },
  };
  const first = f.record(command(100, f.payload({ sourceEventId: source, replacement: change })));
  const reversed = f.record(command(101, f.payload({ sourceEventId: first.replacementEventId })));
  const repair = f.payload({
    sourceEventId: first.replacementEventId,
    expectedReversalId: reversed.reversalEventId,
    replacement: change,
  });
  const receipt = f.record(command(102, repair));
  assert.equal(Schema.is(CorrectionReceipt)(receipt), true);
  assert.equal(receipt.reversalEventId, reversed.reversalEventId);
  assert.throws(() => f.record(command(103, repair)), /already been corrected/);
  assert.equal(
    f.db.sql(
      "select count(*) from public.financial_events where type='opening_balance' and related_event_id is null",
    ),
    "1",
  );
  assert.equal(balance(f.db), 400n);
});
test("32 generated corrections through maximum-safe centimes retain zero-sum projections and exact replacement balances", (t) => {
  const f = fixture(t);
  let expected = 600n;
  for (let i = 0; i < 32; i++) {
    const amount = i === 31 ? 9007199254740991n : BigInt((i + 1) * 997);
    const own = amount / 2n;
    const source = f.seed(`generated-${i}`, 1000, 400);
    const input = f.payload({
      sourceEventId: source,
      replacement: replacement(String(amount), String(own)),
    });
    const result = f.record(command(500 + i, input));
    expected += amount - own;
    assert.equal(balance(f.db), expected);
    assert.equal(Schema.is(CorrectionReceipt)(result), true);
  }
  assert.equal(
    f.db.sql(
      "select count(*) from public.financial_events e where (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2 or (select sum(receivable_delta_cents) from public.ledger_entries l where l.financial_event_id=e.id)<>0",
    ),
    "0",
  );
});
