import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function fixture(t) {
  const f = await worker(t, [
    "tests/database/legacy-recurring/rules.sql",
    "tests/database/legacy-recurring/draft-columns.sql",
    "supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql",
    "supabase/migrations/20260922012902_native_legacy_recurring_drafts.sql",
    "supabase/migrations/20260922014006_native_legacy_draft_dismissal.sql",
  ]);
  f.db
    .sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on) values('${id(800)}','${id(10)}','Legacy rule',101,'${id(1)}','[]','weekly',1,true,'2026-01-05');
  insert into public.expense_drafts(id,household_id,recurring_expense_rule_id,description,occurred_on) values('${id(900)}','${id(10)}','${id(800)}','Original draft','2026-01-05')`);
  const client = f.client(),
    context = await run(client.legacyDraftContext(id(900)));
  const command = {
    operationId: id(700),
    input: { draftId: id(900), ruleId: id(800), reviewToken: context.reviewToken },
  };
  return { ...f, native: client, context, command };
}
const headers = (f) => ({
  authorization: `Bearer ${f.bearer}`,
  "x-nest-household": id(10),
  "content-type": "application/json",
});
test("lost committed dismissal acknowledgment recovers the exact reviewed receipt without reposting or redismissing", async (t) => {
  const f = await fixture(t);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).includes("/legacy-dismissal/save"))
      throw new TypeError("lost committed response");
    return response;
  };
  await assert.rejects(
    run(f.native.saveLegacyDismissal(f.command).pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  const recovery = await run(f.native.recoverLegacyDismissal(f.command));
  assert.equal(recovery.status, "recorded");
  assert.deepEqual(recovery.receipt.reviewed, f.context);
  assert.deepEqual(await run(f.native.saveLegacyDismissal(f.command)), recovery.receipt);
  assert.deepEqual(await run(f.native.cancelLegacyDismissal(f.command)), recovery);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_draft_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("native cancellation fences late Saves and stale context cannot authorize changed draft terms", async (t) => {
  const f = await fixture(t);
  assert.equal((await run(f.native.recoverLegacyDismissal(f.command))).status, "unresolved");
  assert.equal((await run(f.native.cancelLegacyDismissal(f.command))).status, "cancelled");
  await assert.rejects(run(f.native.saveLegacyDismissal(f.command)));
  f.db.sql("update public.expense_drafts set description='Changed after review'");
  await assert.rejects(run(f.native.saveLegacyDismissal({ ...f.command, operationId: id(701) })));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("finite HTTP commands deny unauthorized households and approval bypass, then execute an exactly approved dismissal", async (t) => {
  const f = await fixture(t),
    outsider = f.client(f.url, 3, f.otherBearer);
  await assert.rejects(run(outsider.legacyDraftContext(id(900))));
  await assert.rejects(run(outsider.saveLegacyDismissal(f.command)));
  await assert.rejects(run(outsider.recoverLegacyDismissal(f.command)));
  for (const suffix of [
    `context?draftId=${id(900)}&draftId=${id(900)}`,
    `receipt?operationId=${id(700)}&extra=true`,
  ]) {
    const response = await fetch(`${f.url}/v1/money/recurring/legacy-dismissal/${suffix}`, {
      headers: headers(f),
    });
    assert.equal(response.status, 400);
  }
  const endpoint = `${f.url}/v1/money/recurring/legacy-dismissal/execute`;
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
  assert.equal(f.db.sql("select status from public.expense_drafts"), "dismissed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("native decoding rejects substituted context and receipt identity or reviewed content", async (t) => {
  const f = await fixture(t),
    receipt = await run(f.native.saveLegacyDismissal(f.command));
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
    { ...receipt, input: { ...receipt.input, reviewToken: "0".repeat(64) } },
  ])
    await assert.rejects(
      run(
        f.native
          .saveLegacyDismissal(f.command)
          .pipe(Effect.provideService(Fetch.Fetch, forge(changed))),
      ),
    );
  await assert.rejects(
    run(
      f.native.recoverLegacyDismissal({
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
    p_command: "recurring.dismiss-legacy-draft",
    p_version: 1,
    p_payload: f.command.input,
  });
  await rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: f.command.operationId,
    p_command: "recurring.dismiss-legacy-draft",
    p_version: 1,
    p_payload: f.command.input,
    p_approved: true,
  });
  return approvalId;
}
