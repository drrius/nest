import assert from "node:assert/strict";
import { test } from "node:test";
import { backend, run, id } from "./native-proposal-edit-fixture.mjs";
import { MealProposalRuntime } from "../../apps/mobile/src/meals/proposal-runtime.ts";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";
const weekStart = "2030-01-07";
test("native handoff opens an external proposal, survives a lost read and explicitly approves without another model call", async (t) => {
  const f = await backend(t, "open");
  const origin = {
    operationId: id(810),
    weekStart,
    expectedWeekRevision: "0",
    familiarOnly: false,
  };
  const generated = await run(f.client.proposals.generate(origin));
  const calls = f.provider.calls.length;
  assert.equal(await run(f.sqlite.store.readMealProposalAttempt(f.session, weekStart)), null);
  const runtime = new MealProposalRuntime(
    f.client,
    { store: f.sqlite.store, session: f.session },
    { weekStart, proposalId: generated.receipt.proposalId },
    () => id(811),
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal, null);
  assert.equal(f.proxy.dropped(), 1);
  await runtime.load();
  assert.equal(runtime.getSnapshot().attempt.generation.operationId, origin.operationId);
  assert.deepEqual(runtime.getSnapshot().proposal, generated.envelope.proposal);
  assert.equal((await run(f.client.read(weekStart))).entries.length, 0);
  await runtime.approve(generated.envelope.proposal.revision, generated.receipt.proposalId);
  assert.equal(runtime.getSnapshot().proposal.status, "approved");
  assert.equal(
    (await run(f.client.read(weekStart))).entries.length,
    generated.envelope.proposal.entries.length,
  );
  assert.equal(f.provider.calls.length, calls);
});

for (const approved of [false, true]) {
  test(`native ${approved ? "approved" : "ready"} handoff survives freeze and a lost open response`, async (t) => {
    const f = await backend(t, "open");
    const origin = {
      operationId: id(810),
      weekStart,
      expectedWeekRevision: "0",
      familiarOnly: false,
    };
    const generated = await run(f.client.proposals.generate(origin));
    const proposalId = generated.receipt.proposalId;
    if (approved)
      await run(
        f.client.proposals.approve({ operationId: id(811), proposalId, expectedRevision: "2" }),
      );
    const before = proposalSnapshot(f.remote.db),
      calls = f.provider.calls.length;
    freezeProposals(f.remote.db);
    const create = (store) =>
      new MealProposalRuntime(
        f.client,
        { store, session: f.session },
        { weekStart, proposalId },
        () => id(812),
      );
    const first = create(f.sqlite.store);
    await first.load();
    assert.equal(first.getSnapshot().proposal, null);
    assert.equal(f.proxy.dropped(), 1);
    first.dispose();
    const recovered = create(f.sqlite.reopen().store);
    t.after(() => recovered.dispose());
    await recovered.load();
    assert.equal(recovered.getSnapshot().proposal.status, approved ? "approved" : "ready");
    assert.equal(recovered.getSnapshot().attempt.generation.operationId, origin.operationId);
    assert.equal(recovered.getSnapshot().attempt.proposalId, proposalId);
    assert.equal(f.provider.calls.length, calls);
    assert.equal(proposalSnapshot(f.remote.db), before);
  });
}
