import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const files = [
  "supabase/migrations/20260921210444_native_recurring_state_command.sql",
  "supabase/migrations/20260921213056_native_recurring_state_approval.sql",
  "supabase/migrations/20260928092000_native_financial_approval_expiry.sql",
  "supabase/migrations/20260928100000_native_recurring_approval_expiry.sql",
  "supabase/migrations/20261001093000_native_recurring_state_approval_expiry.sql",
];
for (const action of ["pause", "cancel"]) {
  test(`native ${action} expiry distinguishes unused, denied and consumed outcomes without touching money`, async (t) => {
    const f = await recurringApiFixture(t, files);
    const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
    const change = {
      ruleId: f.rule.ruleId,
      expectedRevision: saved.revision,
      expectedStatus: "active",
      action,
    };
    const command = `recurring.${action}`;
    const propose = (operation) =>
      f.rpc("nest_propose_action", {
        p_household: id(10),
        p_invocation: operation,
        p_command: command,
        p_version: 1,
        p_payload: change,
      });
    const expiry = (approvalId, operationId, token = f.bearer, name = command) =>
      fetch(
        `${f.url}/v1/money/approval-expiry?approvalId=${approvalId}&operationId=${operationId}&command=${name}`,
        { headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) } },
      );
    const unused = await propose(id(700));
    assert.equal((await (await expiry(unused, id(700))).json()).expiredUnused, false);
    f.db.sql(
      `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${unused}'`,
    );
    assert.equal((await (await expiry(unused, id(700))).json()).expiredUnused, true);
    assert.equal((await expiry(unused, id(700), f.partnerBearer)).status, 403);
    assert.equal((await expiry(unused, id(999))).status, 400);
    assert.equal(
      (
        await expiry(
          unused,
          id(700),
          f.bearer,
          action === "pause" ? "recurring.cancel" : "recurring.pause",
        )
      ).status,
      400,
    );
    for (const [operation, approved] of [
      [id(701), false],
      [id(702), true],
    ]) {
      const approvalId = await propose(operation);
      const result = await f.send("/v1/money/recurring/state/approval/decide", {
        operationId: operation,
        approvalId,
        change,
        approved,
      });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).approval.status, approved ? "consumed" : "denied");
      f.db.sql(
        `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${approvalId}'`,
      );
      assert.equal((await (await expiry(approvalId, operation)).json()).expiredUnused, false);
    }
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
    assert.equal(
      f.db.sql("select status from public.nest_recurring_rules"),
      action === "pause" ? "paused" : "cancelled",
    );
  });
}
