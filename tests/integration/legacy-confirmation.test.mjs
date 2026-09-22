import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, run } from "./legacy-confirmation-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const headers = (f) => ({
  authorization: `Bearer ${f.bearer}`,
  "x-nest-household": id(10),
  "content-type": "application/json",
});
test("lost committed confirmation acknowledgment recovers the exact reviewed receipt without posting a duplicate", async (t) => {
  const f = await fixture(t);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).includes("/legacy-confirmation/save"))
      throw new TypeError("lost committed response");
    return response;
  };
  await assert.rejects(
    run(f.native.saveLegacyConfirmation(f.command).pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  const recovery = await run(f.native.recoverLegacyConfirmation(f.command));
  assert.equal(recovery.status, "recorded");
  assert.deepEqual(recovery.receipt.reviewed, f.context);
  assert.deepEqual(await run(f.native.saveLegacyConfirmation(f.command)), recovery.receipt);
  assert.deepEqual(await run(f.native.cancelLegacyConfirmation(f.command)), recovery);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("native cancellation fences late Saves and stale context cannot authorize changed draft terms", async (t) => {
  const f = await fixture(t);
  assert.equal((await run(f.native.recoverLegacyConfirmation(f.command))).status, "unresolved");
  assert.equal((await run(f.native.cancelLegacyConfirmation(f.command))).status, "cancelled");
  await assert.rejects(run(f.native.saveLegacyConfirmation(f.command)));
  f.db.sql("update public.expense_drafts set description='Changed after review'");
  await assert.rejects(
    run(f.native.saveLegacyConfirmation({ ...f.command, operationId: id(701) })),
  );
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("finite HTTP commands deny unauthorized households and approval bypass, then execute an exactly approved confirmation", async (t) => {
  const f = await fixture(t),
    outsider = f.client(f.url, 3, f.otherBearer);
  await assert.rejects(run(outsider.legacyDraftContext(id(900))));
  await assert.rejects(run(outsider.saveLegacyConfirmation(f.command)));
  await assert.rejects(run(outsider.recoverLegacyConfirmation(f.command)));
  for (const suffix of [
    `receipt?operationId=${id(700)}&operationId=${id(700)}`,
    `receipt?operationId=${id(700)}&extra=true`,
  ]) {
    const response = await fetch(`${f.url}/v1/money/recurring/legacy-confirmation/${suffix}`, {
      headers: headers(f),
    });
    assert.equal(response.status, 400);
  }
  const endpoint = `${f.url}/v1/money/recurring/legacy-confirmation/execute`;
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers: headers(f),
        body: JSON.stringify(f.command),
      })
    ).status,
    400,
  );
  const approvalId = await approve(f);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(f),
    body: JSON.stringify({ ...f.command, approvalId }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approvalId, approvalId);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "posted");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("native decoding rejects substituted context and receipt identity or reviewed content", async (t) => {
  const f = await fixture(t),
    receipt = await run(f.native.saveLegacyConfirmation(f.command));
  const forge = (value) => async () =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  for (const changed of [
    { ...f.context, householdId: id(20) },
    { ...f.context, draft: { ...f.context.draft, draftId: id(901) } },
  ])
    await assert.rejects(
      run(
        f.native
          .legacyDraftContext(id(900))
          .pipe(Effect.provideService(Fetch.Fetch, forge(changed))),
      ),
    );
  for (const changed of [
    { ...receipt, actorId: id(2) },
    { ...receipt, operationId: id(701) },
    {
      ...receipt,
      input: { ...receipt.input, expense: { ...receipt.input.expense, note: "Unreviewed terms" } },
    },
    { ...receipt, input: { ...receipt.input, reviewToken: "0".repeat(64) } },
  ])
    await assert.rejects(
      run(
        f.native
          .saveLegacyConfirmation(f.command)
          .pipe(Effect.provideService(Fetch.Fetch, forge(changed))),
      ),
    );
  await assert.rejects(
    run(
      f.native.recoverLegacyConfirmation({
        ...f.command,
        input: { ...f.command.input, reviewToken: "0".repeat(64) },
      }),
    ),
  );
});

async function approve(f) {
  const rpc = async (name, input) => {
    const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(f),
      body: JSON.stringify(input),
    });
    assert.equal(response.ok, true, await response.clone().text());
    return response.json();
  };
  const approvalId = await rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: f.command.operationId,
    p_command: "recurring.confirm-legacy-draft",
    p_version: 1,
    p_payload: f.command.input,
  });
  await rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: f.command.operationId,
    p_command: "recurring.confirm-legacy-draft",
    p_version: 1,
    p_payload: f.command.input,
    p_approved: true,
  });
  return approvalId;
}
