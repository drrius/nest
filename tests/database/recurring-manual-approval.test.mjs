import { command as correct } from "./native-correction-fixture.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture, as, id, json } from "./recurring-manual-fixture.mjs";
const read = (db, sql, actor = 1) => JSON.parse(db.sql(as(actor, sql)));
import { ManualCycleApprovalEnvelope } from "../../packages/contracts/src/recurring-manual-approval.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const file = "supabase/migrations/20260921235439_native_recurring_manual_approval.sql";
function setup(t) {
  const f = fixture(t);
  f.db.file(file);
  f.input = f.setup();
  f.post = (op) => f.command(f.input, op);
  const approval = f.db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(600)}','recurring.link-cycle',1,${json(f.input)})`,
    ),
  );
  const decide = (yes = true, input = f.input) =>
    `select public.nest_decide_manual_cycle('${id(10)}','${id(600)}',${json(input)},'${approval}',${yes})`;
  const query = `select public.nest_read_manual_cycle_approval('${id(10)}','${approval}')`;
  return { ...f, approval, decide, query };
}
test("manual approval records and consumes atomically once with private exact historical recovery", async (t) => {
  const f = setup(t);
  assert.equal(Schema.is(ManualCycleApprovalEnvelope)(read(f.db, f.query)), true);
  const results = await Promise.all([
    f.db.concurrent(as(1, f.decide())),
    f.db.concurrent(as(1, f.decide())),
  ]);
  assert.deepEqual(results[0], results[1]);
  const result = read(f.db, f.query);
  assert.equal(result.approval.status, "consumed");
  assert.deepEqual(result.approval.receipt.input, f.input);
  assert.equal(Schema.is(ManualCycleApprovalEnvelope)(result), true);
  assert.deepEqual(read(f.db, f.decide()), result);
  assert.throws(() => read(f.db, f.query, 2));
  assert.throws(() => read(f.db, f.decide(), 3));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.throws(() =>
    read(
      f.db,
      f.decide(true, {
        ...f.input,
        sourceEventId: id(999),
      }),
    ),
  );
});
test("manual approval denial, expiry and foreign membership cannot post and remain owner scoped", (t) => {
  const f = setup(t);
  assert.throws(() => read(f.db, f.decide(), 2));
  assert.throws(() => read(f.db, f.decide(true, { ...f.input, dueOn: "2099-01-01" })));
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${f.approval}'`,
  );
  assert.throws(() => read(f.db, f.decide()));
  assert.equal(read(f.db, f.query).approval.status, "pending");
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()+interval '1 hour' where id='${f.approval}'`,
  );
  const denied = read(f.db, f.decide(false));
  assert.equal(denied.approval.status, "denied");
  assert.deepEqual(read(f.db, f.decide(false)), denied);
  assert.throws(() => read(f.db, f.decide()));
  assert.throws(() => read(f.db, f.query, 3));
  assert.throws(() => read(f.db, f.decide(false), 3));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("receipt failure rolls approval and financial posting back; externally consumed cycles stay deniable", (t) => {
  const f = setup(t);
  f.db.sql(
    `alter table public.nest_recurring_cycle_receipts add constraint fail_receipt check (false)`,
  );
  assert.throws(() => read(f.db, f.decide()));
  assert.equal(read(f.db, f.query).approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  f.db.sql("alter table public.nest_recurring_cycle_receipts drop constraint fail_receipt");
  read(f.db, f.post(601));
  assert.throws(() => read(f.db, f.decide()));
  assert.equal(read(f.db, f.query).approval.status, "pending");
  assert.equal(read(f.db, f.decide(false)).approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("serialized private review waits for a posting decision and returns its committed receipt", async (t) => {
  const f = setup(t);
  const committing = f.db.concurrent(
    as(
      1,
      `set application_name='manual-review-commit'; begin; ${f.decide()}; select pg_sleep(0.8); commit`,
    ),
  );
  const deadline = Date.now() + 3000;
  while (
    f.db.sql(
      "select count(*) from pg_stat_activity where application_name='manual-review-commit' and wait_event='PgSleep'",
    ) !== "1"
  ) {
    assert.ok(Date.now() < deadline);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const result = await f.db.concurrent(as(1, f.query));
  await committing;
  assert.equal(JSON.parse(result.stdout).approval.status, "consumed");
  assert.equal(
    JSON.parse(result.stdout).approval.receipt.input.sourceEventId,
    f.input.sourceEventId,
  );
});

test("a corrected source leaves manual approval pending and explicitly deniable without changing the cycle", (t) => {
  const f = setup(t);
  f.record(
    correct(901, {
      sourceEventId: f.input.sourceEventId,
      expectedReversalId: null,
      replacement: null,
    }),
  );
  const before = f.db.sql("select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l");
  assert.throws(() => read(f.db, f.decide()));
  assert.equal(read(f.db, f.query).approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  assert.equal(read(f.db, f.decide(false)).approval.status, "denied");
  assert.equal(
    f.db.sql("select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l"),
    before,
  );
});
