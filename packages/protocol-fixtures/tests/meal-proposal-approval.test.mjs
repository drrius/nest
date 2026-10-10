import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, Effect, run, ready, id, weekStart } from "./meal-proposal-fixture.mjs";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
const fail = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
async function started(f) {
  const runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  return runtime;
}

test("approval requires the displayed ready revision and persists exact intent before dispatch", async (t) => {
  const f = await fixture(t),
    runtime = await started(f),
    approve = f.client.proposals.approve;
  f.client.proposals.approve = (input) =>
    Effect.gen(function* () {
      const saved = yield* f.store.readMealProposalAttempt(f.session, weekStart).pipe(Effect.orDie);
      assert.deepEqual(saved.approval, input);
      return yield* approve(input);
    });
  await runtime.approve("2", id(999));
  await runtime.approve("1", ready.proposal.proposalId);
  assert.equal(f.calls.approve, 0);
  await runtime.approve("2", ready.proposal.proposalId);
  assert.equal(f.calls.approve, 1);
  assert.equal(runtime.getSnapshot().proposal.status, "approved");
  await runtime.approve("2", ready.proposal.proposalId);
  await runtime.continue();
  assert.equal(f.calls.approve, 1);
  assert.equal(f.calls.generate, 1);
});

test("lost approval acknowledgment and SQLite restart recover the shared result without re-posting", async (t) => {
  const f = await fixture(t),
    runtime = await started(f),
    approve = f.client.proposals.approve;
  f.client.proposals.approve = (input) => approve(input).pipe(Effect.andThen(fail()));
  await runtime.approve("2", ready.proposal.proposalId);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(f.calls.approve, 1);
  await runtime.discard("2", ready.proposal.proposalId);
  await runtime.reset();
  assert.equal(f.calls.discard, 0);
  runtime.dispose();
  const reopened = f.reopen(),
    next = f.create(reopened.store);
  await next.load();
  assert.equal(next.getSnapshot().proposal.status, "approved");
  await next.continue();
  assert.equal(f.calls.approve, 1);
});

test("uncommitted failed approval is never retried on load; explicit continuation retains its original operation", async (t) => {
  const f = await fixture(t),
    runtime = await started(f),
    approve = f.client.proposals.approve;
  f.client.proposals.approve = () => fail();
  await runtime.approve("2", ready.proposal.proposalId);
  const command = runtime.getSnapshot().attempt.approval;
  runtime.dispose();
  const next = f.create(f.reopen().store);
  await next.load();
  assert.equal(f.calls.approve, 0);
  assert.deepEqual(next.getSnapshot().attempt.approval, command);
  f.client.proposals.approve = (input) => {
    assert.deepEqual(input, command);
    return approve(input);
  };
  await next.continue();
  assert.equal(f.calls.approve, 1);
  assert.equal(next.getSnapshot().proposal.status, "approved");
});

test("definite approval conflicts clear only that intent and require a fresh explicit confirmation", async (t) => {
  const f = await fixture(t),
    runtime = await started(f);
  let attempts = 0;
  f.client.proposals.approve = () => {
    attempts++;
    return fail("conflict");
  };
  await runtime.approve("2", ready.proposal.proposalId);
  assert.equal(runtime.getSnapshot().attempt.approval, undefined);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.match(runtime.getSnapshot().notice ?? "", /changed/);
  await runtime.approve("2", ready.proposal.proposalId);
  assert.equal(attempts, 1);
});

test("storage failure, access denial and mismatched posted entries never invent native approval success", async (t) => {
  const f = await fixture(t),
    runtime = await started(f);
  runtime.dispose();
  const blocked = f.create({
    ...f.store,
    stageProposalApproval: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
  });
  await blocked.load();
  await blocked.approve("2", ready.proposal.proposalId);
  assert.equal(f.calls.approve, 0);
  const another = f.create();
  await another.load();
  const approve = f.client.proposals.approve;
  f.client.proposals.approve = (input) =>
    approve(input).pipe(
      Effect.map((receipt) => ({
        ...receipt,
        entries: receipt.entries.map((entry) => ({ ...entry, proposalEntryId: id(999) })),
      })),
    );
  await another.approve("2", ready.proposal.proposalId);
  assert.equal(another.getSnapshot().proposal.status, "ready");
  assert.equal(another.getSnapshot().fresh, false);
  f.setCurrent(ready);
  f.client.proposals.recover = () => fail("forbidden");
  await another.load();
  assert.equal(another.getSnapshot().proposal, null);
  assert.equal(another.getSnapshot().access, "verify");
});

test("SQLite approval/discard intents cannot coexist or change identity; legacy metadata remains readable", async (t) => {
  const f = await fixture(t),
    runtime = await started(f);
  const legacy = await run(f.store.readMealProposalAttempt(f.session, weekStart));
  assert.equal(legacy.approval, undefined);
  const command = {
    operationId: id(850),
    proposalId: ready.proposal.proposalId,
    expectedRevision: "2",
  };
  const target = { weekStart, command };
  await run(f.store.stageProposalApproval(f.session, target));
  await assert.rejects(
    run(
      f.store.stageProposalApproval(f.session, {
        weekStart,
        command: { ...command, expectedRevision: "3" },
      }),
    ),
    { reason: "pending_edit" },
  );
  await assert.rejects(run(f.store.stageProposalDiscard(f.session, target)), {
    reason: "pending_edit",
  });
  await assert.rejects(
    run(f.store.clearProposalApproval(f.session, { weekStart, operationId: id(851) })),
    { reason: "operation_reused" },
  );
  await run(f.store.clearProposalApproval(f.session, { weekStart, operationId: id(850) }));
  await run(f.store.stageProposalDiscard(f.session, target));
  await assert.rejects(run(f.store.stageProposalApproval(f.session, target)), {
    reason: "pending_edit",
  });
  runtime.dispose();
});
