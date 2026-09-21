import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  id,
  as,
  counts,
  refund,
  correct,
  replacement,
  balance,
} from "./money-correction-fixture.mjs";
test("actual correction retains the original and links reversal/replacement, with one complete retry receipt", async (t) => {
  const f = fixture(t),
    original = f.seed("original");
  const snapshot = f.db.sql(
    `select row_to_json(e) from public.financial_events e where id='${original}'`,
  );
  const sql = correct(original, "correct", replacement(201, 101));
  const replies = await Promise.all(Array.from({ length: 6 }, () => f.db.concurrent(as(1, sql))));
  const values = replies.map(({ stdout }) => JSON.parse(stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(values[0].corrected_financial_event_id, original);
  assert.equal(balance(f.db), 100n);
  assert.equal(
    f.db.sql(`select row_to_json(e) from public.financial_events e where id='${original}'`),
    snapshot,
  );
  assert.equal(
    f.db.sql(`select count(*) from public.financial_events where related_event_id='${original}'`),
    "2",
  );
  assert.equal(
    f.db.sql(
      `select count(*) from public.ledger_entries where financial_event_id in ('${original}','${values[0].reversal_event_id}','${values[0].replacement_event_id}')`,
    ),
    "6",
  );
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.throws(() => f.record(correct(original, "different")), /already been corrected/);
  assert.throws(
    () => f.record(correct(values[0].reversal_event_id, "reverse-reversal")),
    /reversal events cannot/,
  );
  const before = counts(f.db);
  assert.deepEqual(f.record(sql, 2), values[0]);
  assert.equal(counts(f.db), before);
});
test("refunds cap each original share, reversing a refund restores its allowance, and original correction waits", (t) => {
  const f = fixture(t),
    original = f.seed("source", 101, 51);
  const first = f.record(refund(original, "part", 1, 20)).financial_event_id;
  assert.equal(balance(f.db), 30n);
  assert.throws(
    () => f.record(refund(original, "excess-person", 0, 31)),
    /remaining refundable shares/,
  );
  assert.throws(() => f.record(correct(original, "active-refund")), /Reverse the active refunds/);
  f.record(correct(first, "undo-refund"));
  assert.equal(balance(f.db), 50n);
  const all = f.record(refund(original, "all", 51, 50)).financial_event_id;
  assert.equal(balance(f.db), 0n);
  assert.throws(() => f.record(refund(original, "excess", 1, 0)), /remaining refundable shares/);
  f.record(correct(all, "undo-all"));
  f.record(correct(original, "undo-original"));
  assert.equal(balance(f.db), 0n);
  assert.throws(() => f.record(refund(original, "after-reversal", 1, 0)), /has been reversed/);
});
test("distinct concurrent refunds cannot exceed the source and refund/correction races choose one valid outcome", async (t) => {
  const f = fixture(t),
    original = f.seed("concurrent", 100, 0);
  const replies = await Promise.allSettled(
    [1, 2].map((n) => f.db.concurrent(as(1, refund(original, `refund-${n}`, 0, 100)))),
  );
  assert.equal(replies.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(balance(f.db), 0n);
  for (let index = 0; index < 12; index++) {
    const source = f.seed(`race-${index}`, 100, 0);
    const outcomes = await Promise.allSettled([
      f.db.concurrent(as(1, refund(source, `r-${index}`, 0, 100))),
      f.db.concurrent(as(1, correct(source, `c-${index}`))),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(balance(f.db), 0n);
  }
});
test("correction and refund preserve authorization, immutable history and rollback on real notice failure", (t) => {
  const f = fixture(t),
    original = f.seed("guards");
  for (const sql of [correct(original, "forbidden"), refund(original, "forbidden", 1, 1)]) {
    assert.throws(() => f.record(sql, 3), /not a member of household|authorized/);
    assert.throws(() => f.db.sql("set role anon; " + sql), /permission denied/);
  }
  const before = counts(f.db);
  f.db.sql(
    "alter table public.push_outbox add constraint fixture_notice_failure check(false) not valid",
  );
  for (const sql of [
    correct(original, "rollback", replacement(201, 100)),
    refund(original, "rollback-refund", 1, 1),
  ]) {
    assert.throws(() => f.record(sql), /fixture_notice_failure/);
    assert.equal(counts(f.db), before);
  }
  f.db.sql("alter table public.push_outbox drop constraint fixture_notice_failure");
  f.record(correct(original, "rollback", replacement(201, 100)));
  assert.throws(() => f.db.sql("delete from public.financial_events"), /append-only/);
  assert.throws(
    () => f.db.sql("update public.ledger_entries set receivable_delta_cents=0"),
    /append-only/,
  );
});
test("generated partial refunds and corrections preserve exact zero-sum history through the safe centime endpoint", (t) => {
  const f = fixture(t);
  for (let index = 0; index < 32; index++) {
    const amount = index === 31 ? Number.MAX_SAFE_INTEGER : (index + 1) * 1001;
    const own = Math.floor(amount / 2),
      other = amount - own;
    const source = f.seed(`vector-${index}`, amount, own);
    assert.equal(balance(f.db), BigInt(other));
    const returned = Math.floor(other / 2);
    const child = f.record(refund(source, `part-${index}`, 0, returned)).financial_event_id;
    assert.equal(balance(f.db), BigInt(other - returned));
    f.record(correct(child, `undo-${index}`));
    assert.equal(balance(f.db), BigInt(other));
    f.record(correct(source, `remove-${index}`));
    assert.equal(balance(f.db), 0n);
  }
  assert.equal(
    f.db.sql(
      "select count(*) from public.financial_events e where (select count(*) from public.ledger_entries l where l.financial_event_id=e.id)<>2 or (select sum(receivable_delta_cents) from public.ledger_entries l where l.financial_event_id=e.id)<>0",
    ),
    "0",
  );
});
test("opening corrections retain one lineage and cannot fork or replace the opening history", (t) => {
  const f = fixture(t);
  const first = f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Opening',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
  );
  const change = { ...replacement(200, 0), allocations: null };
  const corrected = f.record(correct(first, "opening", change));
  assert.equal(balance(f.db), 200n);
  assert.equal(
    f.db.sql(
      `select type from public.financial_events where id='${corrected.replacement_event_id}'`,
    ),
    "opening_balance",
  );
  assert.throws(() => f.record(correct(first, "fork", change)), /already been corrected/);
  assert.throws(
    () =>
      f.db.sql(
        `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Another root',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
      ),
    /unique/,
  );
  f.record(correct(corrected.replacement_event_id, "remove-opening"));
  assert.equal(balance(f.db), 0n);
  f.record(
    correct(corrected.replacement_event_id, "repair-opening", { ...change, amount_cents: 300 }),
  );
  assert.equal(balance(f.db), 300n);
});
