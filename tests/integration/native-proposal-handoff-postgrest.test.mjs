import assert from "node:assert/strict";
import { test } from "node:test";
import { backend, run, id } from "./native-proposal-edit-fixture.mjs";
import { MealProposalRuntime } from "../../apps/mobile/src/meals/proposal-runtime.ts";
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
