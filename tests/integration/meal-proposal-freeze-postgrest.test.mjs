import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, command, id } from "./meal-proposal-api-fixture.mjs";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";

for (const status of ["ready", "approved", "discarded", "failed"]) {
  test(`frozen ${status} proposal recovers privately without writing or model execution`, async (t) => {
    const f = await fixture(t);
    const provider = model(() => {
      if (status === "failed") throw new Error("Fixture provider failure");
    });
    // The default provider returns a real schema-valid response through the SDK boundary.
    const generation = status === "failed" ? provider : model();
    const generated = await client(f, generation.instance)("/generate", command());
    assert.equal(generated.status, 200, await generated.clone().text());
    const proposalId = (await generated.json()).receipt.proposalId;
    const reader = client(f, undefined, { planningSecret: undefined });
    const decision = { operationId: id(801), proposalId, expectedRevision: "2" };
    if (status === "approved" || status === "discarded") {
      const response = await reader(status === "approved" ? "/approve" : "/discard", decision);
      assert.equal(response.status, 200, await response.clone().text());
    }
    const expected = await (await reader("/recover", { proposalId })).json();
    assert.equal(expected.proposal.status, status);
    const before = proposalSnapshot(f.db),
      calls = generation.calls.length;
    freezeProposals(f.db);
    const result = await reader("/recover", { proposalId });
    assert.equal(result.status, 200, await result.clone().text());
    assert.deepEqual(await result.json(), expected);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const handoff = await reader("/open", { proposalId });
    assert.equal(handoff.status, 200, await handoff.clone().text());
    assert.deepEqual((await handoff.json()).envelope, expected);
    for (const [bearer, expectedStatus] of [
      [f.partnerBearer, 409],
      [f.otherBearer, 403],
      ["invalid", 401],
    ]) {
      const denied = await client(f, undefined, { bearer })("/recover", { proposalId });
      assert.equal(denied.status, expectedStatus);
      assert.equal((await denied.text()).includes(proposalId), false);
    }
    for (const path of ["/approve", "/discard"])
      assert.equal((await reader(path, decision)).status, 503);
    assert.equal(generation.calls.length, calls);
    assert.equal(proposalSnapshot(f.db), before);
  });
}

test("expired unfinished generation stays unavailable while frozen and expires after an explicit resume", async (t) => {
  const f = await fixture(t),
    reader = client(f, undefined, { planningSecret: undefined });
  const reserved = await reader("/reserve", command());
  assert.equal(reserved.status, 200, await reserved.clone().text());
  const proposalId = (await reserved.json()).receipt.proposalId;
  f.db.sql(
    "update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second'",
  );
  const before = proposalSnapshot(f.db);
  freezeProposals(f.db);
  assert.equal((await reader("/recover", { proposalId })).status, 503);
  assert.equal((await reader("/open", { proposalId })).status, 503);
  assert.equal(proposalSnapshot(f.db), before);
  f.db.sql(`select private.nest_set_household_writes_frozen(false);
    grant execute on function public.nest_recover_meal_proposal(uuid,uuid) to authenticated;`);
  const result = await reader("/recover", { proposalId });
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).proposal.status, "failed");
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
});
