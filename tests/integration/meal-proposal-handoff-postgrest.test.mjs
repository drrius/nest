import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, command, id } from "./meal-proposal-api-fixture.mjs";

test("owner handoff opens exact origin and current private preview without model credentials", async (t) => {
  const f = await fixture(t),
    provider = model(),
    c = client(f, provider.instance);
  const generated = await (await c("/generate", command())).json();
  const read = client(f, undefined, { planningSecret: undefined }),
    input = { proposalId: generated.receipt.proposalId };
  const response = await read("/open", input);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), generated);
  assert.equal(provider.calls.length, 2);
  await read("/discard", { operationId: id(801), ...input, expectedRevision: "2" });
  const latest = await (await read("/open", input)).json();
  assert.deepEqual(latest.receipt, generated.receipt);
  assert.equal(latest.envelope.proposal.status, "discarded");
  assert.equal((await read("/open", { ...input, actorId: id(2) })).status, 400);
  assert.equal((await read("/open?approve=true", input)).status, 400);
  assert.equal(
    (await client(f, undefined, { bearer: f.partnerBearer })("/open", input)).status,
    409,
  );
  assert.equal((await client(f, undefined, { bearer: f.otherBearer })("/open", input)).status, 403);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await read("/open", input)).status, 403);
  assert.equal(provider.calls.length, 2);
});
