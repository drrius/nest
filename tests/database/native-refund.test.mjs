import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { RefundContext, RefundReceipt } from "../../packages/contracts/src/refund.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
import { fixture, id, as, command, approve, correct } from "./native-refund-fixture.mjs";
test("refund context and actor-bound retries preserve exact current shares and the original expense", async (t) => {
  const f = fixture(t),
    input = f.payload(),
    before = f.db.sql(
      `select row_to_json(e) from public.financial_events e where id='${f.source}'`,
    );
  assert.deepEqual(f.context().remaining, input.expectedRemaining);
  assert.equal(f.context().refundable, true);
  assert.equal(Schema.is(RefundContext)(f.context()), true);
  assert.deepEqual(f.context(2), f.context());
  assert.throws(() => f.context(3), /Not authorized/);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(1, command(100, input)))),
  );
  const receipts = results.map(({ stdout }) => JSON.parse(stdout));
  for (const result of receipts) assert.deepEqual(result, receipts[0]);
  assert.deepEqual(receipts[0].refund, input);
  assert.equal(Schema.is(RefundReceipt)(receipts[0]), true);
  assert.equal(receipts[0].actorId, id(1));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.deepEqual(f.context().remaining, [
    { memberId: id(1), centimes: "300" },
    { memberId: id(2), centimes: "400" },
  ]);
  assert.equal(
    f.db.sql(`select row_to_json(e) from public.financial_events e where id='${f.source}'`),
    before,
  );
  assert.throws(
    () => f.record(command(100, { ...input, description: "Changed" })),
    /operation changed/,
  );
  assert.throws(() => f.record(command(100, input), 2), /source changed/);
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_refund_receipts")), "0");
  assert.throws(() => f.db.sql("delete from public.nest_refund_receipts"), /append-only/);
});
test("changed refundable shares reject old native and AI reviews without consuming approval", (t) => {
  const f = fixture(t),
    input = f.payload(),
    approval = approve(f, 101, input);
  f.record(command(100, input));
  assert.throws(() => f.record(command(101, input, approval)), /source changed/);
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  assert.throws(() => f.record(command(102, input)), /source changed/);
  const current = f.context().remaining;
  const updated = f.payload({
    expectedRemaining: current,
    amountCentimes: "700",
    allocations: current,
  });
  const final = f.record(command(103, updated));
  assert.equal(f.context().refundable, false);
  assert.deepEqual(f.record(command(103, updated)), final);
  assert.throws(() => f.record(command(104, updated)), /source changed/);
});
test("approval and receipt are atomic under failure; exact approved replay survives expiry", (t) => {
  const f = fixture(t),
    input = f.payload(),
    approval = approve(f, 100, input);
  f.db.sql(
    "alter table public.nest_refund_receipts add constraint fixture_failure check(false) not valid",
  );
  assert.throws(() => f.record(command(100, input, approval)), /fixture_failure/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  assert.deepEqual(f.context().remaining, input.expectedRemaining);
  f.db.sql("alter table public.nest_refund_receipts drop constraint fixture_failure");
  const receipt = f.record(command(100, input, approval));
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "consumed",
  );
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  assert.deepEqual(f.record(command(100, input, approval)), receipt);
});
test("malformed shares, origin injection, wrong source or payer and over-refunds cannot post", (t) => {
  const f = fixture(t),
    input = f.payload();
  for (const patch of [
    {
      amountCentimes: "0",
      allocations: [
        { memberId: id(1), centimes: "0" },
        { memberId: id(2), centimes: "0" },
      ],
    },
    { approved: true },
    { payerId: id(2) },
    { sourceEventId: id(999) },
    { sourceEventId: "bad" },
    {
      expectedRemaining: [
        { memberId: id(1), centimes: "400" },
        { memberId: id(1), centimes: "600" },
      ],
    },
    {
      expectedRemaining: [
        { memberId: id(1), centimes: 400 },
        { memberId: id(2), centimes: "600" },
      ],
    },
    {
      amountCentimes: "601",
      allocations: [
        { memberId: id(1), centimes: "0" },
        { memberId: id(2), centimes: "601" },
      ],
    },
    { receiptTotalCentimes: "300" },
    { date: "2026-02-30" },
  ])
    assert.throws(() => f.record(command(100, { ...input, ...patch })));
  assert.throws(() => f.record(command(100, input), 3), /Not authorized/);
  assert.throws(() => f.db.sql("set role anon; " + command(100, input)), /permission denied/);
  assert.throws(
    () => f.db.sql(as(1, `select private.nest_record_refund('${id(10)}','${id(100)}','{}',null)`)),
    /permission denied/,
  );
  assert.throws(() => f.record(command(100, input, id(999))), /Not authorized/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("distinct native refunds and legacy source corrections retain a compatible lock order", async (t) => {
  const f = fixture(t),
    input = f.payload();
  const outcomes = await Promise.allSettled([
    f.db.concurrent(as(1, command(100, input))),
    f.db.concurrent(as(2, command(101, input))),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const source = f.seed("race-source", 1000, 400),
    race = { ...input, sourceEventId: source };
  const competing = await Promise.allSettled([
    f.db.concurrent(as(1, command(102, race))),
    f.db.concurrent(as(1, correct(source, "reverse-source"))),
  ]);
  assert.equal(competing.filter((value) => value.status === "fulfilled").length, 1);
  const failed = competing.find((value) => value.status === "rejected");
  assert.doesNotMatch(failed.reason.stderr, /deadlock/);
});

test("32 native partial/full sequences preserve remaining shares and original balance through maximum-safe centimes", (t) => {
  const f = fixture(t);
  for (let index = 0; index < 32; index++) {
    const amount = index === 31 ? Number.MAX_SAFE_INTEGER : (index + 1) * 1001;
    const first = Math.floor(amount / 2),
      second = amount - first;
    const source = f.seed(`generated-${index}`, amount, first);
    const shares = (a, b) => [
      { memberId: id(1), centimes: String(a) },
      { memberId: id(2), centimes: String(b) },
    ];
    const partFirst = Math.floor(first / 2),
      partSecond = Math.floor(second / 2);
    const part = f.payload({
      sourceEventId: source,
      amountCentimes: String(partFirst + partSecond),
      allocations: shares(partFirst, partSecond),
      expectedRemaining: shares(first, second),
    });
    f.record(command(500 + index * 2, part));
    const context = f.record(`select public.nest_refund_context('${id(10)}','${source}')`);
    assert.deepEqual(context.remaining, shares(first - partFirst, second - partSecond));
    assert.equal(Schema.is(RefundContext)(context), true);
    const full = {
      ...part,
      amountCentimes: String(amount - partFirst - partSecond),
      allocations: context.remaining,
      expectedRemaining: context.remaining,
    };
    f.record(command(501 + index * 2, full));
    assert.equal(
      f.record(`select public.nest_refund_context('${id(10)}','${source}')`).refundable,
      false,
    );
    assert.equal(
      f.db.sql(
        `select sum(receivable_delta_cents) from public.ledger_entries where member_id='${id(1)}'`,
      ),
      "600",
    );
  }
  assert.equal(
    f.db.sql(
      "select count(*) from public.financial_events e where (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2 or (select sum(receivable_delta_cents) from public.ledger_entries l where l.financial_event_id=e.id)<>0",
    ),
    "0",
  );
});
