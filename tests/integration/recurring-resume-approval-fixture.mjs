import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
export { id, run };
export async function fixture(t, patch = {}) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
    "supabase/migrations/20260921215304_native_recurring_resume_command.sql",
    "supabase/migrations/20260921221542_native_recurring_resume_approval.sql",
    "supabase/migrations/20260921222050_native_recurring_resume_review_fence.sql",
  ]);
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const paused = await run(
    f.client().saveRecurringState({
      operationId: id(601),
      change: {
        ruleId: f.rule.ruleId,
        expectedRevision: saved.revision,
        expectedStatus: "active",
        action: "pause",
      },
    }),
  );
  const change = {
    ruleId: f.rule.ruleId,
    expectedRevision: paused.revision,
    expectedStatus: "paused",
    action: "resume",
    resumeFrom: f.rule.configuration.startDate,
    firstDueOn: f.rule.firstDueOn,
    ...patch,
  };
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.resume",
    p_version: 1,
    p_payload: change,
  });

  return { f, local, account, session, approvalId };
}
