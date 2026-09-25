import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, command } from "./meal-proposal-api-fixture.mjs";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";
test("reservation retries read the exact original result while unknown intent stays unreceived during freeze", async (t) => {
  const f = await fixture(t),
    c = client(f, undefined, { planningSecret: undefined });
  const response = await c("/reserve", command());
  assert.equal(response.status, 200, await response.clone().text());
  const expected = await response.json(),
    before = proposalSnapshot(f.db);
  freezeProposals(f.db);
  const retry = await c("/reserve", command());
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.deepEqual(await retry.json(), expected);
  assert.equal((await c("/reserve", command(801))).status, 503);
  assert.equal((await c("/reserve", { ...command(), familiarOnly: true })).status, 400);
  assert.equal(
    (await client(f, undefined, { bearer: f.partnerBearer })("/reserve", command())).status,
    503,
  );
  assert.equal(
    (await client(f, undefined, { bearer: f.otherBearer })("/reserve", command())).status,
    403,
  );
  assert.equal(proposalSnapshot(f.db), before);
});
