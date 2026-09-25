import test from "node:test";
import assert from "node:assert/strict";
import { fixture as adoption, run } from "./legacy-adoption-card-fixture.mjs";
import { fixture as confirmation } from "./legacy-confirmation-card-fixture.mjs";
import { fixture as dismissal } from "./legacy-dismissal-card-fixture.mjs";
import { suspendLegacyApproval } from "./legacy-approval-freeze-fixture.mjs";

for (const [kind, fixture] of Object.entries({ adoption, confirmation, dismissal })) {
  test(`native ${kind} denial recovers after SQLite restart with decisions and context reads suspended`, async (t) => {
    const f = await fixture(t),
      runtime = await f.mount();
    const events = f.db.sql("select count(*) from public.financial_events");
    f.fault("after");
    await runtime.decide(runtime.getSnapshot().approval, false);
    assert.equal(runtime.getSnapshot().attempt.approved, false);
    assert.equal(f.sends(), 1);
    suspendLegacyApproval(f.db, kind);
    runtime.dispose();
    await f.local.idle();
    const reopened = f.local.reopen(),
      resumed = await f.mount(reopened.store);
    assert.equal(resumed.getSnapshot().approval.status, "denied");
    assert.equal(resumed.getSnapshot().approval.receipt, null);
    assert.equal(resumed.getSnapshot().context, null);
    assert.equal(resumed.getSnapshot().attempt, null);
    assert.equal(resumed.getSnapshot().fresh, true);
    assert.equal(
      await run(reopened.store.readRecurringStateApproval(f.session, f.approvalId)),
      null,
    );
    assert.equal(f.sends(), 1);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), events);
  });
}
