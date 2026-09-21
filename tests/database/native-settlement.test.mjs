import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, counts, expense, id } from "./money-expense-helpers.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/money-expense-fixture.sql",
  "tests/database/legacy-money/settlement-command.sql",
  "supabase/migrations/20260919213407_native_action_approvals.sql",
  "supabase/migrations/20260921134717_native_settlement_command.sql",
])
  db.file(file);
const payload = (patch = {}) => ({
  description: "Reviewed settlement",
  amountCentimes: "1000",
  expectedOutstandingCentimes: "1000",
  payerId: id(2),
  recipientId: id(1),
  mode: "full",
  date: "2026-09-21",
  note: null,
  ...patch,
});
/** @param {number} op @param {ReturnType<typeof payload>} [value] @param {string | null} [approval] */
const save = (op, value = payload(), approval = null) =>
  `select public.${approval ? "nest_execute_settlement" : "nest_save_settlement"}('${id(10)}','${id(op)}','${JSON.stringify(value)}'${approval ? `,'${approval}'` : ""})`;
const result = (sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
const seed = (key, amount = 1000) => db.sql(as(1, expense(key, { amount, own: 0 })));
const balance = () =>
  db.sql(
    `select coalesce(sum(receivable_delta_cents),0) from public.ledger_entries where member_id='${id(1)}'`,
  );
function approval(op, value = payload()) {
  const key = db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(op)}','settlements.record',1,'${JSON.stringify(value)}')`,
    ),
  );
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${key}','${id(op)}','settlements.record',1,'${JSON.stringify(value)}',true)`,
    ),
  );
  return key;
}
test("native partial settlement retries are actor-bound, exact and independent of later balance changes", async () => {
  seed("native-start");
  const input = payload({ mode: "partial", amountCentimes: "300" });
  const rows = await Promise.all(
    Array.from({ length: 8 }, () => db.concurrent(as(1, save(100, input)))),
  );
  const receipt = JSON.parse(rows[0].stdout);
  for (const row of rows) assert.deepEqual(JSON.parse(row.stdout), receipt);
  assert.equal(receipt.approvalId, null);
  assert.equal(balance(), "700");
  assert.equal(db.sql(as(2, "select count(*) from public.nest_settlement_receipts")), "0");
  assert.throws(() => result(save(100, input), 2), /balance changed/);
  seed("native-later", 50);
  assert.deepEqual(result(save(100, input)), receipt);
  assert.throws(() => result(save(100, { ...input, note: "Changed" })), /operation changed/);
  result(save(101, payload({ amountCentimes: "750", expectedOutstandingCentimes: "750" })));
  assert.equal(balance(), "0");
  assert.throws(() => db.sql("delete from public.nest_settlement_receipts"), /append-only/);
});
test("stale full settlement cannot increase the reviewed amount or consume approval; exact refreshed approval posts once", () => {
  seed("approval-seed");
  const old = approval(200);
  seed("changed-balance", 50);
  const before = counts(db);
  assert.throws(() => result(save(200, payload(), old)), /balance changed/);
  assert.equal(counts(db), before);
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${old}'`),
    "approved",
  );
  const input = payload({ amountCentimes: "1050", expectedOutstandingCentimes: "1050" }),
    key = approval(201, input);
  const receipt = result(save(201, input, key));
  assert.equal(balance(), "0");
  assert.equal(receipt.settlement.amountCentimes, "1050");
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${key}'`,
  );
  assert.deepEqual(result(save(201, input, key)), receipt);
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${key}'`),
    "consumed",
  );
});
test("authorization, exact approval and malformed payload failures leave ledger and receipts unchanged", () => {
  seed("deny-seed");
  const before = counts(db);
  assert.throws(() => result(save(300), 3), /Not authorized/);
  assert.throws(() => db.sql("set role anon; " + save(300)), /permission denied/);
  assert.throws(
    () =>
      db.sql(as(1, `select private.nest_record_settlement('${id(10)}','${id(300)}','{}',null)`)),
    /permission denied/,
  );
  assert.throws(() => result(save(300, payload(), id(999))), /Not authorized/);
  const pending = db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(300)}','settlements.record',1,'${JSON.stringify(payload())}')`,
    ),
  );
  assert.throws(() => result(save(300, payload(), pending)), /Approval not valid/);
  for (const patch of [
    { amountCentimes: "0" },
    { amountCentimes: "1001" },
    { amountCentimes: 1000 },
    { recipientId: id(3) },
    { payerId: id(1), recipientId: id(1) },
    { mode: "other" },
    { description: "\u00a0" },
    { date: "2026-02-30" },
    { note: "x".repeat(4001) },
    { extra: true },
  ])
    assert.throws(() => result(save(301, payload(patch))));
  assert.equal(counts(db), before);
  result(save(302));
  assert.equal(balance(), "0");
});
test("notification failure rolls back approval consumption and all settlement effects", () => {
  seed("rollback-seed");
  const key = approval(400),
    before = counts(db);
  db.sql(
    "alter table public.push_outbox add constraint native_settlement_failure check(status='failed') not valid",
  );
  try {
    assert.throws(() => result(save(400, payload(), key)), /native_settlement_failure/);
    assert.equal(counts(db), before);
    assert.equal(
      db.sql(`select status from public.nest_action_approvals where id='${key}'`),
      "approved",
    );
  } finally {
    db.sql("alter table public.push_outbox drop constraint native_settlement_failure");
  }
  result(save(400, payload(), key));
  assert.equal(balance(), "0");
});
test("distinct exact full settlements race to one committed event and one stale-balance conflict", async () => {
  seed("native-race");
  const before = JSON.parse(counts(db));
  const outcomes = await Promise.allSettled([
    db.concurrent(as(1, save(500))),
    db.concurrent(as(2, save(501))),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  assert.match(
    outcomes.find((value) => value.status === "rejected").reason.stderr,
    /balance changed/,
  );
  assert.equal(balance(), "0");
  assert.deepEqual(
    JSON.parse(counts(db)).map((value, index) => value - before[index]),
    [1, 0, 2, 1, 1, 1, 1],
  );
});
test("native generated partial/full sequences bind exact balances through the safe centime endpoint", () => {
  for (let index = 0; index < 32; index++) {
    const amount = index === 0 ? Number.MAX_SAFE_INTEGER : index * 7919 + 2,
      part = Math.max(1, Math.floor(amount / 3));
    seed(`native-vector-${index}`, amount);
    const partial = payload({
      mode: "partial",
      amountCentimes: String(part),
      expectedOutstandingCentimes: String(amount),
    });
    const receipt = result(save(1000 + index * 2, partial));
    assert.equal(receipt.settlement.amountCentimes, String(part));
    assert.equal(balance(), String(BigInt(amount) - BigInt(part)));
    const remaining = String(BigInt(amount) - BigInt(part));
    result(
      save(
        1001 + index * 2,
        payload({ amountCentimes: remaining, expectedOutstandingCentimes: remaining }),
      ),
    );
    assert.equal(balance(), "0");
  }
});
