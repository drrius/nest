import { suspendLegacyApproval } from "./legacy-approval-freeze-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./legacy-adoption-card-fixture.mjs";
import {
  matchesAdoptionContext,
  legacyAdoptionApprovalActions,
  legacyAdoptionApprovalText,
} from "../../apps/mobile/src/money/legacy-adoption-approval-display.ts";
const actions = (runtime) => legacyAdoptionApprovalActions(runtime.getSnapshot(), Date.now());
test("private native card stages before dispatch and recovers a committed adoption after write suspension and SQLite restart without replay", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount(),
    approval = runtime.getSnapshot().approval;
  assert.equal(actions(runtime).confirm, true);
  assert.match(
    legacyAdoptionApprovalText(approval, runtime.getSnapshot().context, id(1)),
    /Original retained rule.*New configuration proposed for authorization/s,
  );
  const context = runtime.getSnapshot().context;
  assert.equal(
    matchesAdoptionContext(approval, {
      ...context,
      input: {
        ...context.input,
        configuration: { ...context.input.configuration, note: "Substituted proposed expense" },
      },
    }),
    false,
  );
  assert.ok(
    legacyAdoptionApprovalText(approval, context, id(1)).includes(
      f.command.input.configuration.note,
    ),
  );
  f.fault("after");
  await runtime.decide(approval, true);
  assert.equal(runtime.getSnapshot().attempt.approved, true);
  assert.equal(f.sends(), 1);
  suspendLegacyApproval(f.db, "adoption");
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().approval.status, "consumed");
  assert.deepEqual(resumed.getSnapshot().approval.receipt.reviewed, f.context);
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
  assert.equal(await run(reopened.store.readRecurringStateApproval(f.session, f.approvalId)), null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
});
test("unresolved adoption survives reverted raw rule state; withdrawal is persisted and fences delayed adoption", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  const original = f.db.sql("select row_to_json(d)::text from public.recurring_expense_rules d");
  f.fault("before");
  await runtime.decide(runtime.getSnapshot().approval, true);
  f.db.sql("update public.recurring_expense_rules set description='Changed'");
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().attempt.approved, true);
  assert.equal(actions(runtime).confirm, false);
  assert.equal(actions(runtime).withdraw, true);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(f.sends(), 1);
  await resumed.withdraw(resumed.getSnapshot().approval);
  assert.equal(resumed.getSnapshot().attempt.approved, false);
  const saved = await run(reopened.store.readRecurringStateApproval(f.session, f.approvalId));
  assert.equal(saved.approved, false);
  await assert.rejects(
    run(
      reopened.store.stageRecurringStateApproval(
        f.session,
        { ...saved, approved: true },
        () => true,
      ),
    ),
  );
  // Restore the complete raw row: a matching old fingerprint must not resurrect consent.
  f.db.sql(
    `update public.recurring_expense_rules d set description=r.description,updated_at=r.updated_at from json_populate_record(null::public.recurring_expense_rules,'${original.replaceAll("'", "''")}') r where d.id=r.id`,
  );
  f.fault("none");
  await resumed.refresh();
  await resumed.retry();
  assert.equal(resumed.getSnapshot().approval.status, "denied");
  await assert.rejects(run(f.native.decideLegacyAdoption(f.decision)));
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
});
test("withdrawal truthfully recovers an adoption that won first and expiry still permits explicit denial", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.decide(runtime.getSnapshot().approval, true);
  await runtime.refresh();
  await run(f.native.decideLegacyAdoption(f.decision));
  f.fault("none");
  await runtime.withdraw(runtime.getSnapshot().approval);
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_adoption_operations"), "1");
  const other = await fixture(t),
    expired = await other.mount();
  other.db.sql("update public.nest_action_approvals set expires_at=now()-interval '1 second'");
  await expired.refresh();
  assert.equal(actions(expired).confirm, false);
  assert.equal(actions(expired).deny, true);
  await expired.decide(expired.getSnapshot().approval, false);
  assert.equal(expired.getSnapshot().approval.status, "denied");
  assert.equal(other.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
});
test("stale native alerts, offline actions and changed accounts cannot send a decision", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount(),
    old = runtime.getSnapshot().approval;
  await runtime.refresh();
  await runtime.decide(old, true);
  const current = runtime.getSnapshot().approval;
  await runtime.setActive(false);
  await runtime.decide(current, true);
  assert.equal(runtime.getSnapshot().approval, null);
  await runtime.setActive(true);
  await runtime.setOnline(false);
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.sends(), 0);
  await runtime.setOnline(true);
  f.fault("before");
  await runtime.decide(runtime.getSnapshot().approval, true);
  const partner = await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  assert.equal(await run(f.local.store.readRecurringStateApproval(partner, f.approvalId)), null);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().approval, null);
  await runtime.retry();
  assert.equal(f.sends(), 1);
});
test("failed SQLite staging or revocation sends nothing; failed cleanup retains the confirmed outcome", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.local.connection.exec(
    "CREATE TRIGGER block_stage BEFORE INSERT ON recurring_state_approval_attempts BEGIN SELECT RAISE(ABORT,'stage'); END",
  );
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.sends(), 0);
  f.local.connection.exec("DROP TRIGGER block_stage");
  await runtime.refresh();
  f.fault("before");
  await runtime.decide(runtime.getSnapshot().approval, true);
  await runtime.refresh();
  f.local.connection.exec(
    "CREATE TRIGGER block_revoke BEFORE UPDATE ON recurring_state_approval_attempts BEGIN SELECT RAISE(ABORT,'revoke'); END",
  );
  await runtime.withdraw(runtime.getSnapshot().approval);
  assert.equal(f.sends(), 1);
  assert.equal(
    (await run(f.local.store.readRecurringStateApproval(f.session, f.approvalId))).approved,
    true,
  );
  f.local.connection.exec("DROP TRIGGER block_revoke");
  f.local.connection.exec(
    "CREATE TRIGGER block_cleanup BEFORE DELETE ON recurring_state_approval_attempts BEGIN SELECT RAISE(ABORT,'cleanup'); END",
  );
  f.fault("none");
  await runtime.refresh();
  await runtime.retry();
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.ok(runtime.getSnapshot().attempt);
  assert.match(runtime.getSnapshot().notice, /server confirmed/);
  f.local.connection.exec("DROP TRIGGER block_cleanup");
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(f.sends(), 2);
});

test("native approval resolves the actual category label and refuses archived categories while preserving decline", async (t) => {
  const f = await fixture(t, true),
    runtime = await f.mount();
  assert.equal(actions(runtime).confirm, true);
  assert.match(
    legacyAdoptionApprovalText(
      runtime.getSnapshot().approval,
      runtime.getSnapshot().context,
      id(1),
    ),
    /Proposed category: Household/,
  );
  f.db.sql(`update public.expense_categories set archived_at=now() where id='${id(500)}'`);
  await runtime.refresh();
  assert.equal(actions(runtime).confirm, false);
  assert.equal(actions(runtime).deny, true);
  assert.match(
    legacyAdoptionApprovalText(
      runtime.getSnapshot().approval,
      runtime.getSnapshot().context,
      id(1),
    ),
    /Household \(archived\)/,
  );
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.sends(), 0);
  await runtime.decide(runtime.getSnapshot().approval, false);
  assert.equal(runtime.getSnapshot().approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

test("restart exposes a confirmed adoption even when SQLite cannot clear its saved attempt", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("after");
  await runtime.decide(runtime.getSnapshot().approval, true);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen();
  reopened.connection.exec(
    "CREATE TRIGGER block_restart_cleanup BEFORE DELETE ON recurring_state_approval_attempts BEGIN SELECT RAISE(ABORT,'cleanup'); END",
  );
  const resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().approval.status, "consumed");
  assert.ok(resumed.getSnapshot().attempt);
  assert.match(resumed.getSnapshot().notice, /server confirmed/);
  assert.equal(f.sends(), 1);
  reopened.connection.exec("DROP TRIGGER block_restart_cleanup");
  await resumed.refresh();
  assert.equal(resumed.getSnapshot().approval.status, "consumed");
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
});
