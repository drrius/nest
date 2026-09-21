import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const migration = "supabase/migrations/20260921201455_native_recurring_approval.sql";
for (const approved of [true, false]) {
  test(`recurring ${approved ? "approval" : "denial"} recovers lost acknowledgment through fresh native client`, async (t) => {
    const f = await recurringApiFixture(t, [migration]);
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: id(700),
      p_command: "recurring.create",
      p_version: 1,
      p_payload: f.rule,
    });
    const input = { operationId: id(700), approvalId, rule: f.rule, approved };
    const client = f.client();
    const pending = await run(client.recurringApproval(approvalId));
    assert.equal(pending.status, "pending");
    assert.deepEqual(pending.rule, f.rule);
    await substitutedResponses(client, approvalId, pending);
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/approval/decide");
    await assert.rejects(run(f.client(proxy.url).decideRecurring(input)));
    assert.equal(proxy.dropped(), 1);
    const recovered = await run(f.client().recurringApproval(approvalId));
    assert.equal(recovered.status, approved ? "consumed" : "denied");
    assert.deepEqual(await run(f.client().decideRecurring(input)), recovered);
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_rules"),
      approved ? "1" : "0",
    );
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      approved ? "1" : "0",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    await assert.rejects(run(f.client(f.url, 2, f.partnerBearer).recurringApproval(approvalId)));
    await assert.rejects(run(client.decideRecurring({ ...input, operationId: id(701) })));
    const duplicate = await fetch(
      `${f.url}/v1/money/recurring/approval?approvalId=${approvalId}&approvalId=${approvalId}`,
      {
        headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
      },
    );
    assert.equal(duplicate.status, 400);
    const extra = await f.send("/v1/money/recurring/approval/decide", { ...input, actorId: id(1) });
    assert.equal(extra.status, 400);
    f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
    await assert.rejects(run(client.recurringApproval(approvalId)));
    await assert.rejects(run(client.decideRecurring(input)));
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
        client.recurringApproval(approvalId).pipe(
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
