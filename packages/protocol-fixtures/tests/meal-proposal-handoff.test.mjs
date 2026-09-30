import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  Effect,
  run,
  command,
  receipt,
  ready,
  pending,
  id,
  weekStart,
} from "./meal-proposal-fixture.mjs";
import { OfflineFailure } from "../src/offline/contracts.ts";
import { MealProposalRuntime } from "../src/meals/proposal-runtime.ts";
import { requestedProposalScope } from "../src/meals/proposal-handoff.ts";
const opened = { version: 1, receipt, envelope: ready };
function handoff(t, f, store = f.store) {
  f.client.proposals.open ??= () => Effect.succeed(opened);
  const runtime = new MealProposalRuntime(
    f.client,
    { store, session: f.session },
    { weekStart, proposalId: receipt.proposalId },
    () => assert.fail("Opening must not create an operation"),
  );
  t.after(() => runtime.dispose());
  return runtime;
}
test("handoff adopts original metadata and restart reads without generating or persisting content", async (t) => {
  const f = await fixture(t),
    runtime = handoff(t, f);
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().proposal, ready.proposal);
  const attempt = await run(f.store.readMealProposalAttempt(f.session, weekStart));
  assert.deepEqual(attempt, { generation: command, proposalId: receipt.proposalId, discard: null });
  f.setCurrent(ready);
  const reopened = f.reopen(),
    next = handoff(t, f, reopened.store);
  await next.load();
  assert.equal(next.getSnapshot().fresh, true);
  assert.equal(f.calls.generate, 0);
  assert.equal(f.calls.reserve, 0);
});
test("unreserved, generating and uncertain local requests block a different handoff", async (t) => {
  const f = await fixture(t),
    old = { ...command, operationId: id(801) };
  await run(f.store.stageMealProposal(f.session, old));
  f.client.proposals.open = () => assert.fail("Must preserve existing intent");
  const runtime = handoff(t, f);
  await runtime.load();
  assert.equal(runtime.getSnapshot().attempt.proposalId, null);
  assert.match(runtime.getSnapshot().notice, /different request/);
  await run(f.store.recordMealProposal(f.session, { ...receipt, ...old, proposalId: id(901) }));
  f.setCurrent({ ...pending, proposal: { ...pending.proposal, proposalId: id(901) } });
  await runtime.load();
  assert.equal(runtime.getSnapshot().attempt.generation.operationId, id(801));
  assert.match(runtime.getSnapshot().notice, /different request/);
});
test("handoff compares original operation and refuses concurrently staged approval", async (t) => {
  const f = await fixture(t),
    old = { ...command, operationId: id(801) };
  await run(f.store.stageMealProposal(f.session, old));
  await run(f.store.recordMealProposal(f.session, { ...receipt, ...old, proposalId: id(901) }));
  f.setCurrent({ ...ready, proposal: { ...ready.proposal, proposalId: id(901) } });
  const approval = { operationId: id(850), proposalId: id(901), expectedRevision: "2" };
  f.client.proposals.open = () =>
    Effect.gen(function* () {
      yield* f.store
        .stageProposalApproval(f.session, { weekStart, command: approval })
        .pipe(Effect.orDie);
      return opened;
    });
  const runtime = handoff(t, f);
  await runtime.load();
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(runtime.getSnapshot().proposal.proposalId, id(901));
  const saved = await run(f.store.readMealProposalAttempt(f.session, weekStart));
  assert.deepEqual(saved.approval, approval);
  await assert.rejects(
    run(f.store.adoptMealProposal(f.session, { receipt, previousOperationId: null })),
    { reason: "operation_reused" },
  );
});
test("same-origin adoption preserves intents while wrong owner or metadata cannot replace them", async (t) => {
  const f = await fixture(t);
  await run(f.store.stageMealProposal(f.session, command));
  await run(f.store.recordMealProposal(f.session, receipt));
  const discard = { operationId: id(850), proposalId: receipt.proposalId, expectedRevision: "2" };
  await run(f.store.stageProposalDiscard(f.session, { weekStart, command: discard }));
  assert.deepEqual(
    (await run(f.store.adoptMealProposal(f.session, { receipt, previousOperationId: null })))
      .discard,
    discard,
  );
  await assert.rejects(
    run(
      f.store.adoptMealProposal(f.session, {
        receipt: { ...receipt, familiarOnly: true },
        previousOperationId: command.operationId,
      }),
    ),
    { reason: "invalid_receipt" },
  );
  await assert.rejects(
    run(
      f.store.adoptMealProposal(f.session, {
        receipt: { ...receipt, actorId: id(2) },
        previousOperationId: command.operationId,
      }),
    ),
    { reason: "invalid_receipt" },
  );
});
test("wrong-week handoff and stale account lease cannot persist or reveal a preview", async (t) => {
  const f = await fixture(t);
  f.client.proposals.open = () =>
    Effect.succeed({
      ...opened,
      receipt: { ...receipt, weekStart: "2030-01-14" },
      envelope: {
        ...ready,
        proposal: {
          ...ready.proposal,
          weekStart: "2030-01-14",
          entries: ready.proposal.entries.map((e) => ({ ...e, date: "2030-01-14" })),
        },
      },
    });
  const runtime = handoff(t, f);
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal, null);
  assert.equal(await run(f.store.readMealProposalAttempt(f.session, weekStart)), null);
  f.client.proposals.open = () =>
    Effect.gen(function* () {
      yield* f.store.activate({ actor: id(2), household: id(10) }, id(998)).pipe(Effect.orDie);
      return opened;
    });
  await runtime.load();
  assert.equal(runtime.getSnapshot().access, "verify");
  assert.equal(runtime.getSnapshot().proposal, null);
});
test("proposal routes require exact proposal and week while ordinary week navigation retains its default", () => {
  assert.deepEqual(
    requestedProposalScope({ weekStart, proposalId: id(900).toUpperCase() }, weekStart),
    { weekStart, proposalId: id(900) },
  );
  for (const params of [
    { proposalId: id(900) },
    { weekStart, proposalId: "bad" },
    { weekStart, proposalId: [id(900)] },
    { weekStart: "2030-01-08", proposalId: id(900) },
  ])
    assert.equal(requestedProposalScope(params, weekStart), null);
  assert.equal(requestedProposalScope({}, weekStart), weekStart);
});

test("a fresh different preview can be adopted even when its revision is lower", async (t) => {
  const f = await fixture(t),
    old = { ...command, operationId: id(801) };
  await run(f.store.stageMealProposal(f.session, old));
  await run(f.store.recordMealProposal(f.session, { ...receipt, ...old, proposalId: id(901) }));
  f.setCurrent({ ...ready, proposal: { ...ready.proposal, proposalId: id(901), revision: "10" } });
  const runtime = handoff(t, f);
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().proposal, ready.proposal);
  assert.deepEqual(
    (await run(f.store.readMealProposalAttempt(f.session, weekStart))).generation,
    command,
  );
  assert.equal(f.calls.generate, 0);
});

test("failed metadata adoption leaves the incoming preview hidden and retryable", async (t) => {
  const f = await fixture(t);
  let fail = true;
  const store = {
    ...f.store,
    adoptMealProposal: (...args) =>
      fail
        ? Effect.fail(new OfflineFailure({ reason: "storage" }))
        : f.store.adoptMealProposal(...args),
  };
  const runtime = handoff(t, f, store);
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal, null);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(await run(f.store.readMealProposalAttempt(f.session, weekStart)), null);
  fail = false;
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal.proposalId, receipt.proposalId);
  assert.equal(f.calls.generate, 0);
});
