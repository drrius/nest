import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const files = [
  "supabase/migrations/20260921210444_native_recurring_state_command.sql",
  "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
  "supabase/migrations/20260921215304_native_recurring_resume_command.sql",
  "supabase/migrations/20260921221542_native_recurring_resume_approval.sql",
  "supabase/migrations/20260921222050_native_recurring_resume_review_fence.sql",
  "supabase/migrations/20260928092000_native_financial_approval_expiry.sql",
  "supabase/migrations/20260928100000_native_recurring_approval_expiry.sql",
  "supabase/migrations/20261001103000_native_recurring_resume_approval_expiry.sql",
];
for (const action of ["resume"]) {
  test(`native ${action} expiry distinguishes unused, denied and consumed outcomes without touching money`, async (t) => {
    const f = await recurringApiFixture(t, files);
    const created = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
    const saved = await run(
      f.client().saveRecurringState({
        operationId: id(601),
        change: {
          ruleId: f.rule.ruleId,
          expectedRevision: created.revision,
          expectedStatus: "active",
          action: "pause",
        },
      }),
    );
    const change = {
      ruleId: f.rule.ruleId,
      expectedRevision: saved.revision,
      expectedStatus: "paused",
      action,
      resumeFrom: f.rule.configuration.startDate,
      firstDueOn: f.rule.firstDueOn,
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
    assert.equal((await expiry(unused, id(700), f.bearer, "recurring.pause")).status, 400);
    for (const [operation, approved] of [
      [id(701), false],
      [id(702), true],
    ]) {
      const approvalId = await propose(operation);
      const result = await f.send("/v1/money/recurring/resume/approval/decide", {
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
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "3");
    assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  });
}

for (const action of ["resume"]) {
  test(`${action} expiry waits for the real in-flight recurring decision and preserves its receipt`, async (t) => {
    const f = await recurringApiFixture(t, files);
    const created = await run(f.client().saveRecurring({ operationId: id(800), rule: f.rule }));
    const saved = await run(
      f.client().saveRecurringState({
        operationId: id(601),
        change: {
          ruleId: f.rule.ruleId,
          expectedRevision: created.revision,
          expectedStatus: "active",
          action: "pause",
        },
      }),
    );
    const change = {
      ruleId: f.rule.ruleId,
      expectedRevision: saved.revision,
      expectedStatus: "paused",
      action,
      resumeFrom: f.rule.configuration.startDate,
      firstDueOn: f.rule.firstDueOn,
    };
    const operation = id(801);
    const approval = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: operation,
      p_command: `recurring.${action}`,
      p_version: 1,
      p_payload: change,
    });
    f.db.sql(
      `update public.nest_action_approvals set expires_at=now()-interval '1 second' where id='${approval}'`,
    );
    const writer = f.db.concurrent(`begin;
      set application_name='nest-resume-expiry-race';
      update public.nest_action_approvals set expires_at=now()+interval '1 minute' where id='${approval}';
      set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
      select public.nest_decide_recurring_resume('${id(10)}','${operation}','${JSON.stringify(change)}'::jsonb,'${approval}',true);
      select pg_sleep(0.5); commit;`);
    try {
      let observed = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        observed =
          f.db.sql(
            "select exists(select 1 from pg_stat_activity where application_name='nest-resume-expiry-race' and wait_event='PgSleep')",
          ) === "t";
        if (observed) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(observed, true, "writer must hold its successful uncommitted decision");
      const response = await fetch(
        `${f.url}/v1/money/approval-expiry?approvalId=${approval}&operationId=${operation}&command=recurring.${action}`,
        {
          headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
        },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).expiredUnused, false);
    } finally {
      await writer;
    }
    const result = await run(f.client().recurringResumeApproval(approval));
    assert.equal(result.status, "consumed");
    assert.equal(result.receipt.approvalId, approval);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "2");
  });
}
