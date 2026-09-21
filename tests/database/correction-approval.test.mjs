import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { CorrectionApprovalEnvelope } from "../../packages/contracts/src/correction-approval.ts";
import {
  fixture as base,
  id,
  as,
  json,
  command,
  replacement,
} from "./native-correction-fixture.mjs";
import { correct, refund } from "./money-correction-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
function fixture(t) {
  const f = base(t);
  f.db.file("supabase/migrations/20260921163322_native_correction_approval.sql");
  const payload = f.payload({ replacement: replacement() });
  const approval = f.db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(100)}','expenses.correct',1,${json(payload)})`,
    ),
  );
  const decide = (approved = true, input = payload) =>
    `select public.nest_decide_correction('${id(10)}','${id(100)}',${json(input)},'${approval}',${approved})`;
  const read = () => `select public.nest_read_correction_approval('${id(10)}','${approval}')`;
  return { ...f, payload, approval, decide, read };
}
test("atomic correction confirmations converge and consumed receipt survives expiry and later source changes", async (t) => {
  const f = fixture(t);
  assert.equal(Schema.is(CorrectionApprovalEnvelope)(f.record(f.read())), true);
  const outcomes = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(1, f.decide()))),
  );
  const result = JSON.parse(outcomes[0].stdout);
  for (const value of outcomes) assert.deepEqual(JSON.parse(value.stdout), result);
  assert.equal(Schema.is(CorrectionApprovalEnvelope)(result), true);
  for (const approval of [
    { ...result.approval, status: "pending" },
    { ...result.approval, operationId: id(999) },
    { ...result.approval, correction: { ...result.approval.correction, replacement: null } },
  ])
    assert.equal(Schema.is(CorrectionApprovalEnvelope)({ ...result, approval }), false);
  assert.equal(Schema.is(CorrectionApprovalEnvelope)({ ...result, actorId: id(2) }), false);
  assert.equal(result.approval.status, "consumed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  f.record(correct(result.approval.receipt.replacementEventId, "reverse-replacement"));
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${f.approval}'`,
  );
  assert.deepEqual(f.record(f.decide()).approval.receipt, result.approval.receipt);
  assert.throws(() => f.record(f.decide(false)), /expired|no longer pending/);
});
test("denial remains terminal and owner-only; malformed or substituted decisions cannot post", (t) => {
  const f = fixture(t);
  for (const actor of [2, 3]) {
    assert.throws(() => f.record(f.read(), actor), /Not authorized/);
    assert.throws(() => f.record(f.decide(), actor), /Not authorized/);
  }
  assert.throws(() => f.db.sql(`set role anon; ${f.read()}`), /permission denied/);
  assert.throws(() => f.record(f.decide(true, { ...f.payload, replacement: null })), /changed/);
  assert.throws(
    () => f.record(f.decide(true, { ...f.payload, sourceEventId: id(999) })),
    /unavailable/,
  );
  const denied = f.record(f.decide(false));
  assert.equal(denied.approval.status, "denied");
  assert.equal(Schema.is(CorrectionApprovalEnvelope)(denied), true);
  assert.throws(() => f.record(f.decide()), /no longer pending/);
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${f.approval}'`,
  );
  assert.equal(f.record(f.decide(false)).approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("stale correction source and receipt failure roll back confirmation to pending", (t) => {
  const f = fixture(t);
  f.db.sql(
    "alter table public.nest_correction_receipts add constraint fixture_failure check(false) not valid",
  );
  assert.throws(() => f.record(f.decide()), /fixture_failure/);
  assert.equal(f.record(f.read()).approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  f.db.sql("alter table public.nest_correction_receipts drop constraint fixture_failure");
  f.record(command(200, f.payload));
  assert.throws(() => f.record(f.decide()), /source changed/);
  assert.equal(f.record(f.read()).approval.status, "pending");
  assert.equal(f.record(f.decide(false)).approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
});
test("correction confirmation races with original correction without a lock-order deadlock", async (t) => {
  const f = fixture(t);
  const outcomes = await Promise.allSettled([
    f.db.concurrent(as(1, f.decide())),
    f.db.concurrent(as(1, correct(f.source, "racing-correction"))),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const rejected = outcomes.find((value) => value.status === "rejected");
  assert.doesNotMatch(rejected.reason.stderr, /deadlock/);
  const read = f.record(f.read());
  assert.equal(Schema.is(CorrectionApprovalEnvelope)(read), true);
  assert.equal(read.approval.status, outcomes[0].status === "fulfilled" ? "consumed" : "pending");
});

test("competing correction confirmation and denial commit only one terminal decision", async (t) => {
  const f = fixture(t);
  const outcomes = await Promise.allSettled([
    f.db.concurrent(as(1, f.decide())),
    f.db.concurrent(as(1, f.decide(false))),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const result = f.record(f.read());
  assert.ok(["consumed", "denied"].includes(result.approval.status));
  assert.equal(
    f.db.sql("select count(*) from public.financial_events"),
    result.approval.status === "consumed" ? "3" : "1",
  );
});

test("correction approval expiring while waiting for the source cannot post", async (t) => {
  const f = fixture(t);
  const lock = f.db.concurrent(
    `set application_name='correction-expiry-holder'; begin; select 1 from public.financial_events where id='${f.source}' for update; select pg_sleep(2); commit;`,
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      f.db.sql(
        "select count(*) from pg_stat_activity where application_name='correction-expiry-holder' and wait_event='PgSleep'",
      ) === "1"
    )
      break;
    if (attempt === 99) throw Error("Source lock not acquired");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  f.db.sql(
    `update public.nest_action_approvals set expires_at=clock_timestamp()+interval '0.2 seconds' where id='${f.approval}'`,
  );
  await assert.rejects(f.db.concurrent(as(1, f.decide())), /expired/);
  await lock;
  assert.equal(f.record(f.read()).approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("approved refund reversal locks its parent before the refund while legacy source corrections compete", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 8; i++) {
    const source = f.seed(`parent-race-${i}`, 1000, 400);
    const returned = f.record(refund(source, `return-${i}`, 100, 200)).financial_event_id;
    const input = { sourceEventId: returned, expectedReversalId: null, replacement: null },
      op = id(300 + i);
    const approval = f.db.sql(
      as(
        1,
        `select public.nest_propose_action('${id(10)}','${op}','expenses.correct',1,${json(input)})`,
      ),
    );
    const outcomes = await Promise.allSettled([
      f.db.concurrent(
        as(
          1,
          `select public.nest_decide_correction('${id(10)}','${op}',${json(input)},'${approval}',true)`,
        ),
      ),
      f.db.concurrent(as(2, correct(source, `legacy-source-${i}`))),
    ]);
    assert.equal(outcomes[0].status, "fulfilled");
    if (outcomes[1].status === "rejected") {
      assert.match(outcomes[1].reason.stderr, /active refunds/);
      assert.doesNotMatch(outcomes[1].reason.stderr, /deadlock/);
    }
  }
});
