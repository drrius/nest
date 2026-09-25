import test from "node:test";
import assert from "node:assert/strict";
import { fixture as adoption, run } from "./legacy-adoption-card-fixture.mjs";
import { fixture as confirmation } from "./legacy-confirmation-card-fixture.mjs";
import { fixture as dismissal } from "./legacy-dismissal-card-fixture.mjs";
import { suspendLegacyApproval } from "./legacy-approval-freeze-fixture.mjs";

for (const [kind, fixture] of Object.entries({ adoption, confirmation, dismissal })) {
  test(`unreceived native ${kind} approval survives freeze and only explicit retry executes after resume`, async (t) => {
    const f = await fixture(t),
      runtime = await f.mount();
    f.fault("before");
    await runtime.decide(runtime.getSnapshot().approval, true);
    const expected = await run(f.local.store.readRecurringStateApproval(f.session, f.approvalId));
    assert.equal(expected.approved, true);
    const events = f.db.sql("select count(*) from public.financial_events");
    suspendLegacyApproval(f.db, kind);
    runtime.dispose();
    await f.local.idle();
    const reopened = f.local.reopen(),
      resumed = await f.mount(reopened.store);
    const pending = () => run(reopened.store.readRecurringStateApproval(f.session, f.approvalId));
    assert.deepEqual(await pending(), expected);
    assert.equal(resumed.getSnapshot().fresh, false);
    assert.equal(resumed.getSnapshot().verify, false);
    assert.ok(resumed.getSnapshot().notice);
    await resumed.retry();
    assert.equal(f.sends(), 1);
    const context = kind === "adoption" ? "adoption_approval_context" : `${kind}_context`;
    f.db.sql(
      `grant execute on function public.nest_read_legacy_${context}(uuid,uuid) to authenticated`,
    );
    await resumed.refresh();
    assert.equal(resumed.getSnapshot().approval.status, "pending");
    assert.equal(f.sends(), 1);
    f.fault("none");
    await resumed.retry();
    assert.equal(f.sends(), 2);
    assert.equal(resumed.getSnapshot().verify, false);
    assert.deepEqual(await pending(), expected);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), events);
    assert.equal(f.db.sql("select status from public.nest_action_approvals"), "pending");
    f.db.sql(
      `grant execute on function public.nest_decide_legacy_${kind}(uuid,uuid,jsonb,uuid,boolean) to authenticated`,
    );
    await resumed.refresh();
    assert.equal(f.sends(), 2);
    await resumed.retry();
    assert.equal(resumed.getSnapshot().approval.status, "consumed");
    assert.equal(resumed.getSnapshot().attempt, null);
    assert.equal(await pending(), null);
    assert.equal(f.sends(), 3);
    assert.equal(
      Number(f.db.sql("select count(*) from public.financial_events")),
      Number(events) + (kind === "confirmation" ? 1 : 0),
    );
    await resumed.refresh();
    await resumed.retry();
    assert.equal(f.sends(), 3);
  });
}
