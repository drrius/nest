import test from "node:test";
import assert from "node:assert/strict";
import { fixture as dismissal, id, run } from "./legacy-dismissal-fixture.mjs";
async function fixture(t) {
  const f = await dismissal(t, [
    "supabase/migrations/20260922020528_native_legacy_dismissal_approval.sql",
  ]);
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_propose_action`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_invocation: f.command.operationId,
      p_command: "recurring.dismiss-legacy-draft",
      p_version: 1,
      p_payload: f.command.input,
    }),
  });
  assert.equal(response.ok, true, await response.clone().text());
  const approvalId = await response.json();
  return { ...f, approvalId, decision: { ...f.command, approvalId, approved: true } };
}
test("native private approval reads current context and confirms or recovers exact atomic dismissal", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyDismissalApproval(f.approvalId));
  const context = await run(f.native.legacyDismissalContext(approval));
  assert.deepEqual(context.review, f.context);
  assert.deepEqual(context.input, f.command.input);
  const result = await run(f.native.decideLegacyDismissal(f.decision));
  assert.equal(result.status, "consumed");
  assert.deepEqual(result.receipt.reviewed, f.context);
  assert.deepEqual(await run(f.native.decideLegacyDismissal(f.decision)), result);
  assert.deepEqual(await run(f.native.legacyDismissalApproval(f.approvalId)), result);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_draft_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("private approval APIs reject partner and changed draft but preserve an explicit denial path", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyDismissalApproval(f.approvalId)),
    partner = f.client(f.url, 2, f.partnerBearer);
  await assert.rejects(run(partner.legacyDismissalApproval(f.approvalId)));
  await assert.rejects(run(partner.legacyDismissalContext(approval)));
  await assert.rejects(run(partner.decideLegacyDismissal(f.decision)));
  f.db.sql("update public.expense_drafts set description='New terms'");
  assert.notEqual(
    (await run(f.native.legacyDismissalContext(approval))).review.reviewToken,
    approval.input.reviewToken,
  );
  await assert.rejects(run(f.native.decideLegacyDismissal(f.decision)));
  assert.equal((await run(f.native.legacyDismissalApproval(f.approvalId))).status, "pending");
  assert.equal(
    (await run(f.native.decideLegacyDismissal({ ...f.decision, approved: false }))).status,
    "denied",
  );
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
