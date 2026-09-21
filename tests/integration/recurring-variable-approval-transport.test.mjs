import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-variable-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const migrations = ["supabase/migrations/20260921230643_native_recurring_variable_approval.sql"];
for (const approved of [true, false]) {
  test(`variable cycle ${approved ? "approval" : "denial"} recovers lost acknowledgment through fresh native client`, async (t) => {
    const f = await fixture(t, migrations);
    const cycle = f.command.input;
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: id(700),
      p_command: "recurring.record-cycle",
      p_version: 1,
      p_payload: cycle,
    });
    const input = { operationId: id(700), approvalId, input: cycle, approved };
    const client = f.client();
    const pending = await run(client.variableCycleApproval(approvalId));
    assert.equal(pending.status, "pending");
    assert.deepEqual(pending.input, cycle);
    await substitutedResponses(client, approvalId, pending);
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/variable/approval/decide");
    await assert.rejects(run(f.client(proxy.url).decideVariableCycle(input)));
    assert.equal(proxy.dropped(), 1);
    const recovered = await run(f.client().variableCycleApproval(approvalId));
    assert.equal(recovered.status, approved ? "consumed" : "denied");
    assert.deepEqual(await run(f.client().decideVariableCycle(input)), recovered);
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), approved ? "1" : "0");
    await assert.rejects(
      run(f.client(f.url, 2, f.partnerBearer).variableCycleApproval(approvalId)),
    );
    await assert.rejects(run(client.decideVariableCycle({ ...input, operationId: id(701) })));
    const duplicate = await fetch(
      `${f.url}/v1/money/recurring/variable/approval?approvalId=${approvalId}&approvalId=${approvalId}`,
      {
        headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
      },
    );
    assert.equal(duplicate.status, 400);
    const extra = await f.send("/v1/money/recurring/variable/approval/decide", {
      ...input,
      actorId: id(1),
    });
    assert.equal(extra.status, 400);
    if (approved) return;
    f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
    await assert.rejects(run(client.variableCycleApproval(approvalId)));
    await assert.rejects(run(client.decideVariableCycle(input)));
  });
}

async function substitutedResponses(client, approvalId, pending) {
  const envelope = { version: 1, actorId: id(1), householdId: id(10), approval: pending };
  for (const change of [
    { actorId: id(2) },
    { householdId: id(99) },
    { approval: { ...pending, id: id(98) } },
    { approval: { ...pending, status: "consumed", receipt: null } },
  ]) {
    const response = { ...envelope, ...change };
    await assert.rejects(
      Effect.runPromise(
        client.variableCycleApproval(approvalId).pipe(
          Effect.provideService(
            Fetch.Fetch,
            async () =>
              new Response(JSON.stringify(response), {
                headers: { "content-type": "application/json" },
              }),
          ),
        ),
      ),
    );
  }
}
