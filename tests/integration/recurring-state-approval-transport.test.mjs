import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const migrations = [
  "supabase/migrations/20260921210444_native_recurring_state_command.sql",
  "supabase/migrations/20260921213056_native_recurring_state_approval.sql",
];
for (const approved of [true, false]) {
  test(`recurring ${approved ? "approval" : "denial"} recovers lost acknowledgment through fresh native client`, async (t) => {
    const f = await recurringApiFixture(t, migrations);
    const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
    const change = {
      ruleId: f.rule.ruleId,
      expectedRevision: saved.revision,
      expectedStatus: "active",
      action: "pause",
    };
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: id(700),
      p_command: "recurring.pause",
      p_version: 1,
      p_payload: change,
    });
    const input = { operationId: id(700), approvalId, change: change, approved };
    const client = f.client();
    const pending = await run(client.recurringStateApproval(approvalId));
    assert.equal(pending.status, "pending");
    assert.deepEqual(pending.change, change);
    await substitutedResponses(client, approvalId, pending);
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/state/approval/decide");
    await assert.rejects(run(f.client(proxy.url).decideRecurringState(input)));
    assert.equal(proxy.dropped(), 1);
    const recovered = await run(f.client().recurringStateApproval(approvalId));
    assert.equal(recovered.status, approved ? "consumed" : "denied");
    assert.deepEqual(await run(f.client().decideRecurringState(input)), recovered);
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      approved ? "2" : "1",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    await assert.rejects(
      run(f.client(f.url, 2, f.partnerBearer).recurringStateApproval(approvalId)),
    );
    await assert.rejects(run(client.decideRecurringState({ ...input, operationId: id(701) })));
    const duplicate = await fetch(
      `${f.url}/v1/money/recurring/state/approval?approvalId=${approvalId}&approvalId=${approvalId}`,
      {
        headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
      },
    );
    assert.equal(duplicate.status, 400);
    const extra = await f.send("/v1/money/recurring/state/approval/decide", {
      ...input,
      actorId: id(1),
    });
    assert.equal(extra.status, 400);
    f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
    await assert.rejects(run(client.recurringStateApproval(approvalId)));
    await assert.rejects(run(client.decideRecurringState(input)));
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
        client.recurringStateApproval(approvalId).pipe(
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
