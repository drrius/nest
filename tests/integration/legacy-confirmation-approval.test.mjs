import test from "node:test";
import assert from "node:assert/strict";
import { fixture as confirmation, id, run } from "./legacy-confirmation-fixture.mjs";
async function fixture(t) {
  const f = await confirmation(t, [
    "supabase/migrations/20260922030816_native_legacy_confirmation_approval.sql",
  ]);
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_propose_action`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_invocation: f.command.operationId,
      p_command: "recurring.confirm-legacy-draft",
      p_version: 1,
      p_payload: f.command.input,
    }),
  });
  assert.equal(response.ok, true, await response.clone().text());
  const approvalId = await response.json();
  return { ...f, approvalId, decision: { ...f.command, approvalId, approved: true } };
}
test("native private approval reads current context and confirms or recovers exact atomic confirmation", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyConfirmationApproval(f.approvalId));
  const context = await run(f.native.legacyConfirmationContext(approval));
  assert.deepEqual(context.review, f.context);
  assert.deepEqual(context.input, f.command.input);
  for (const expense of [
    { ...f.command.input.expense, note: "Unapproved changed note" },
    { ...f.command.input.expense, date: "2026-01-01" },
    { ...f.command.input.expense, description: "Unapproved description" },
  ])
    await assert.rejects(
      run(
        f.native.decideLegacyConfirmation({
          ...f.decision,
          input: { ...f.command.input, expense },
        }),
      ),
    );
  const result = await run(f.native.decideLegacyConfirmation(f.decision));
  assert.equal(result.status, "consumed");
  assert.deepEqual(result.receipt.reviewed, f.context);
  assert.deepEqual(await run(f.native.decideLegacyConfirmation(f.decision)), result);
  assert.deepEqual(await run(f.native.legacyConfirmationApproval(f.approvalId)), result);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("private approval APIs reject partner and changed draft but preserve an explicit denial path", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyConfirmationApproval(f.approvalId)),
    partner = f.client(f.url, 2, f.partnerBearer);
  await assert.rejects(run(partner.legacyConfirmationApproval(f.approvalId)));
  await assert.rejects(run(partner.legacyConfirmationContext(approval)));
  await assert.rejects(run(partner.decideLegacyConfirmation(f.decision)));
  f.db.sql("update public.expense_drafts set description='New terms'");
  assert.notEqual(
    (await run(f.native.legacyConfirmationContext(approval))).review.reviewToken,
    approval.input.reviewToken,
  );
  await assert.rejects(run(f.native.decideLegacyConfirmation(f.decision)));
  assert.equal((await run(f.native.legacyConfirmationApproval(f.approvalId))).status, "pending");
  assert.equal(
    (await run(f.native.decideLegacyConfirmation({ ...f.decision, approved: false }))).status,
    "denied",
  );
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
