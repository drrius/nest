import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, ready, jsonOk } from "./meal-proposal-edit-api-fixture.mjs";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";
for (const status of ["applied", "failed", "pending"]) {
  test(`frozen ${status} edit preserves exact intent and result without a new model run`, async (t) => {
    const f = await fixture(t),
      { input } = await ready(f);
    const provider = model((value) => {
      if (status === "failed") throw new Error("Fixture failure");
      return value;
    });
    const c = client(f, provider.instance),
      reader = client(f, undefined, { planningSecret: undefined });
    const expected = await jsonOk(await c(status === "pending" ? "/edit/reserve" : "/edit", input));
    assert.equal(expected.status, status);
    if (status === "pending")
      f.db.sql(
        "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()-interval '1 second'",
      );
    const before = proposalSnapshot(f.db),
      calls = provider.calls.length;
    freezeProposals(f.db);
    const response = await reader("/edit/recover", { operationId: input.operationId });
    if (status === "pending") assert.equal(response.status, 503);
    else assert.deepEqual(await jsonOk(response), expected);
    for (const [bearer, deniedStatus] of [
      [f.partnerBearer, 409],
      [f.otherBearer, 403],
      ["invalid", 401],
    ])
      assert.equal(
        (
          await client(f, undefined, { bearer })("/edit/recover", {
            operationId: input.operationId,
          })
        ).status,
        deniedStatus,
      );
    assert.equal((await c("/edit", input)).status, 503);
    assert.equal(provider.calls.length, calls);
    assert.equal(proposalSnapshot(f.db), before);
    if (status === "pending") {
      f.db.sql(`select private.nest_set_household_writes_frozen(false);
        grant execute on function public.nest_read_proposal_edit(uuid,uuid) to authenticated;`);
      const recovered = await jsonOk(
        await reader("/edit/recover", { operationId: input.operationId }),
      );
      assert.equal(recovered.status, "failed");
      assert.equal(recovered.failure, "unavailable");
      assert.equal(provider.calls.length, 0);
    }
  });
}
