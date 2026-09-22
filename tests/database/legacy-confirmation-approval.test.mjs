import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as confirmation, id, as, json } from "./legacy-draft-confirmation-fixture.mjs";
import {
  LegacyConfirmationApprovalEnvelope,
  LegacyConfirmationContext,
} from "../../packages/contracts/src/legacy-confirmation-approval.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url)),
  Schema = require("effect/Schema");
function fixture(t) {
  const f = confirmation(t);
  f.db.file("supabase/migrations/20260922030816_native_legacy_confirmation_approval.sql");
  const input = f.input(),
    approvalId = f.db.sql(
      as(
        1,
        `select public.nest_propose_action('${id(10)}','${id(700)}','recurring.confirm-legacy-draft',1,${json(input)})`,
      ),
    );
  const query = `select public.nest_read_legacy_confirmation_approval('${id(10)}','${approvalId}')`;
  const context = `select public.nest_read_legacy_confirmation_context('${id(10)}','${approvalId}')`;
  const decide = (approved = true, payload = input) =>
    `select public.nest_decide_legacy_confirmation('${id(10)}','${id(700)}',${json(payload)},'${approvalId}',${approved})`;
  return { ...f, input, approvalId, query, context, decide };
}
test("private approval executes atomically once and recovers the exact consumed receipt", async (t) => {
  const f = fixture(t);
  assert.equal(Schema.is(LegacyConfirmationApprovalEnvelope)(f.record(f.query)), true);
  assert.equal(Schema.is(LegacyConfirmationContext)(f.record(f.context)), true);
  const results = await Promise.all([
    f.db.concurrent(as(1, f.decide())),
    f.db.concurrent(as(1, f.decide())),
  ]);
  assert.deepEqual(JSON.parse(results[0].stdout), JSON.parse(results[1].stdout));
  const result = f.record(f.query);
  assert.equal(result.approval.status, "consumed");
  assert.deepEqual(result.approval.receipt.input, f.input);
  assert.equal(Schema.is(LegacyConfirmationApprovalEnvelope)(result), true);
  assert.deepEqual(f.record(f.decide()), result);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "posted");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("approval denial, expiry and ownership prevent confirmation and remain privately recoverable", (t) => {
  const f = fixture(t);
  for (const actor of [2, 3])
    for (const query of [f.query, f.context, f.decide(), f.decide(false)])
      assert.throws(() => f.record(query, actor));
  assert.throws(() => f.record(f.decide(true, { ...f.input, reviewToken: "0".repeat(64) })));
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${f.approvalId}'`,
  );
  assert.throws(() => f.record(f.decide()));
  assert.equal(f.record(f.query).approval.status, "pending");
  f.db.sql(
    `update public.nest_action_approvals set expires_at=now()+interval '1 hour' where id='${f.approvalId}'`,
  );
  const denied = f.record(f.decide(false));
  assert.equal(denied.approval.status, "denied");
  assert.deepEqual(f.record(f.decide(false)), denied);
  assert.throws(() => f.record(f.decide()));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  for (const role of ["anon", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.query}`), /permission denied/);
});
test("receipt failure rolls approval back; externally changed drafts remain explicitly deniable", (t) => {
  const f = fixture(t);
  f.db.sql(
    "alter table private.nest_legacy_confirmation_operations add constraint fail_approval check(false)",
  );
  assert.throws(() => f.record(f.decide()));
  assert.equal(f.record(f.query).approval.status, "pending");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  for (const table of [
    "financial_events",
    "ledger_entries",
    "financial_allocations",
    "activity_events",
    "inbox_notifications",
    "push_outbox",
  ])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  f.db.sql("alter table private.nest_legacy_confirmation_operations drop constraint fail_approval");
  f.db.sql("update public.expense_drafts set description='Changed since proposal'");
  const context = f.record(f.context);
  assert.equal(Schema.is(LegacyConfirmationContext)(context), true);
  assert.notEqual(context.review.reviewToken, context.input.reviewToken);
  assert.throws(() => f.record(f.decide()), /draft changed/);
  assert.equal(f.record(f.query).approval.status, "pending");
  assert.equal(f.record(f.decide(false)).approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "0");
});
test("approval status waits for a concurrent confirmation commit and sees the exact receipt", async (t) => {
  const f = fixture(t);
  const committing = f.db.concurrent(
    as(
      1,
      `set application_name='legacy-dismiss-review'; begin; ${f.decide()}; select pg_sleep(0.8); commit`,
    ),
  );
  const deadline = Date.now() + 3000;
  while (
    f.db.sql(
      "select count(*) from pg_stat_activity where application_name='legacy-dismiss-review' and wait_event='PgSleep'",
    ) !== "1"
  ) {
    assert.ok(Date.now() < deadline);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const result = await f.db.concurrent(as(1, f.query));
  await committing;
  const approval = JSON.parse(result.stdout).approval;
  assert.equal(approval.status, "consumed");
  assert.deepEqual(approval.receipt.input, f.input);
});
