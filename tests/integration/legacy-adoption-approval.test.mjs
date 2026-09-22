import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture as adoption, id, run } from "./legacy-adoption-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function fixture(t) {
  const f = await adoption(t, [
    "supabase/migrations/20260922195459_native_legacy_adoption_approval.sql",
  ]);
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_propose_action`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_invocation: f.command.operationId,
      p_command: "recurring.adopt-legacy",
      p_version: 1,
      p_payload: f.command.input,
    }),
  });
  assert.equal(response.ok, true, await response.clone().text());
  const approvalId = await response.json();
  return { ...f, approvalId, decision: { ...f.command, approvalId, approved: true } };
}
test("native private approval reads current context and confirms or recovers exact atomic adoption", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyAdoptionApproval(f.approvalId));
  const context = await run(f.native.legacyAdoptionApprovalContext(approval));
  assert.deepEqual(context.review, f.context);
  assert.deepEqual(context.input, f.command.input);
  for (const configuration of [
    { ...f.command.input.configuration, note: "Unapproved changed note" },
    { ...f.command.input.configuration, startDate: "2026-01-01" },
    { ...f.command.input.configuration, description: "Unapproved description" },
  ])
    await assert.rejects(
      run(
        f.native.decideLegacyAdoption({
          ...f.decision,
          input: { ...f.command.input, configuration },
        }),
      ),
    );
  const result = await run(f.native.decideLegacyAdoption(f.decision));
  assert.equal(result.status, "consumed");
  assert.deepEqual(result.receipt.reviewed, f.context);
  assert.deepEqual(await run(f.native.decideLegacyAdoption(f.decision)), result);
  assert.deepEqual(await run(f.native.legacyAdoptionApproval(f.approvalId)), result);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_adoption_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("private approval APIs reject partner and changed rule but preserve an explicit denial path", async (t) => {
  const f = await fixture(t),
    approval = await run(f.native.legacyAdoptionApproval(f.approvalId)),
    partner = f.client(f.url, 2, f.partnerBearer);
  await assert.rejects(run(partner.legacyAdoptionApproval(f.approvalId)));
  await assert.rejects(run(partner.legacyAdoptionApprovalContext(approval)));
  await assert.rejects(run(partner.decideLegacyAdoption(f.decision)));
  f.db.sql("update public.recurring_expense_rules set description='New terms'");
  assert.notEqual(
    (await run(f.native.legacyAdoptionApprovalContext(approval))).review.reviewToken,
    approval.input.reviewToken,
  );
  await assert.rejects(run(f.native.decideLegacyAdoption(f.decision)));
  assert.equal((await run(f.native.legacyAdoptionApproval(f.approvalId))).status, "pending");
  assert.equal(
    (await run(f.native.decideLegacyAdoption({ ...f.decision, approved: false }))).status,
    "denied",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
});

test("lost approved response recovers privately and forged approval bindings fail closed", async (t) => {
  const f = await fixture(t);
  const lose = async (input, init) => {
    const response = await fetch(input, init);
    assert.equal(response.ok, true);
    throw new TypeError("lost committed acknowledgment");
  };
  await assert.rejects(
    run(f.native.decideLegacyAdoption(f.decision).pipe(Effect.provideService(Fetch.Fetch, lose))),
  );
  const approval = await run(f.native.legacyAdoptionApproval(f.approvalId));
  assert.equal(approval.status, "consumed");
  assert.deepEqual(await run(f.native.decideLegacyAdoption(f.decision)), approval);
  const envelope = { version: 1, actorId: id(1), householdId: id(10), approval };
  for (const forged of [
    { ...envelope, actorId: id(2) },
    { ...envelope, householdId: id(20) },
    { ...envelope, approval: { ...approval, id: id(999) } },
    { ...envelope, approval: { ...approval, operationId: id(999) } },
    {
      ...envelope,
      approval: { ...approval, input: { ...approval.input, firstDueOn: "9999-12-31" } },
    },
  ]) {
    const injected = async () =>
      new Response(JSON.stringify(forged), { headers: { "content-type": "application/json" } });
    await assert.rejects(
      run(
        f.native
          .decideLegacyAdoption(f.decision)
          .pipe(Effect.provideService(Fetch.Fetch, injected)),
      ),
    );
  }
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
