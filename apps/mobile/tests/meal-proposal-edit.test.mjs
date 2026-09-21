import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, Effect, run, ready, id, weekStart, account } from "./meal-proposal-fixture.mjs";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
const target = {
  action: "replace",
  proposalId: ready.proposal.proposalId,
  expectedRevision: "2",
  entryId: id(950),
};
const fail = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
function install(f) {
  let result = null,
    calls = 0;
  f.client.proposals.edits = {
    execute: (command) =>
      Effect.sync(() => {
        calls++;
        const changed = structuredClone(ready);
        changed.proposal.revision = "3";
        changed.proposal.entries[0].source.recipe.title = "New meal";
        f.setCurrent(changed);
        const { expectedRevision, ...rest } = command;
        result = {
          version: 1,
          actorId: account.actor,
          householdId: account.household,
          command,
          expiresAt: Date.now() + 120000,
          status: "applied",
          failure: null,
          receipt: {
            version: 1,
            actorId: account.actor,
            householdId: account.household,
            ...rest,
            previousRevision: expectedRevision,
            revision: "3",
          },
        };
        return result;
      }),
    recover: () => (result ? Effect.succeed(result) : fail("conflict")),
  };
  return { calls: () => calls };
}
async function started(f) {
  const runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  return runtime;
}

test("native edit validates the displayed target and persists exact intent before dispatch", async (t) => {
  const f = await fixture(t),
    tracking = install(f),
    runtime = await started(f),
    execute = f.client.proposals.edits.execute;
  f.client.proposals.edits.execute = (input) =>
    Effect.gen(function* () {
      const saved = yield* f.store.readMealProposalAttempt(f.session, weekStart).pipe(Effect.orDie);
      assert.deepEqual(saved.edit, input);
      return yield* execute(input);
    });
  await runtime.edit({ ...target, entryId: id(999) });
  await runtime.edit({ ...target, proposalId: id(999) });
  await runtime.edit({ ...target, expectedRevision: "1" });
  assert.equal(tracking.calls(), 0);
  await runtime.edit(target);
  assert.equal(tracking.calls(), 1);
  assert.equal(runtime.getSnapshot().proposal.revision, "3");
  assert.equal(runtime.getSnapshot().attempt.edit, undefined);
  assert.equal(runtime.getSnapshot().proposal.entries[0].source.recipe.title, "New meal");
  await runtime.edit(target);
  assert.equal(tracking.calls(), 1);
});

test("lost completion survives SQLite restart and load only recovers without executing", async (t) => {
  const f = await fixture(t),
    tracking = install(f),
    runtime = await started(f),
    execute = f.client.proposals.edits.execute;
  f.client.proposals.edits.execute = (input) => execute(input).pipe(Effect.andThen(fail()));
  await runtime.edit(target);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.approve("2", target.proposalId);
  await runtime.discard("2", target.proposalId);
  await runtime.reset();
  assert.equal(f.calls.approve, 0);
  assert.equal(f.calls.discard, 0);
  runtime.dispose();
  const next = f.create(f.reopen().store);
  await next.load();
  assert.equal(next.getSnapshot().proposal.revision, "3");
  assert.equal(next.getSnapshot().attempt.edit, undefined);
  assert.equal(tracking.calls(), 1);
});

test("unregistered edit keeps its exact command across restart until explicit continuation", async (t) => {
  const f = await fixture(t),
    tracking = install(f),
    runtime = await started(f),
    execute = f.client.proposals.edits.execute;
  f.client.proposals.edits.execute = () => fail();
  await runtime.edit(target);
  const command = runtime.getSnapshot().attempt.edit;
  runtime.dispose();
  const next = f.create(f.reopen().store);
  await next.load();
  assert.equal(tracking.calls(), 0);
  assert.equal(next.getSnapshot().fresh, false);
  f.client.proposals.edits.execute = (input) => {
    assert.deepEqual(input, command);
    return execute(input);
  };
  await next.continue();
  assert.equal(tracking.calls(), 1);
  assert.equal(next.getSnapshot().attempt.edit, undefined);
});

test("pending reservation blocks new edits and approval; failed recovery keeps the original preview", async (t) => {
  const f = await fixture(t);
  install(f);
  const runtime = await started(f);
  let state;
  f.client.proposals.edits.execute = (command) =>
    Effect.sync(() => {
      state = {
        version: 1,
        actorId: account.actor,
        householdId: account.household,
        command,
        expiresAt: Date.now() + 120000,
        status: "pending",
        failure: null,
        receipt: null,
      };
      return state;
    });
  f.client.proposals.edits.recover = () => Effect.succeed(state);
  await runtime.edit(target);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.approve("2", target.proposalId);
  await runtime.discard("2", target.proposalId);
  assert.equal(f.calls.approve + f.calls.discard, 0);
  state = { ...state, status: "failed", failure: "no_suitable_meals" };
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal.entries[0].source.recipe.title, "Soup");
  assert.equal(runtime.getSnapshot().attempt.edit, undefined);
  assert.match(runtime.getSnapshot().notice, /No suitable/);
});

test("definite absent conflict clears intent but completion conflict recovers existing applied state", async (t) => {
  const f = await fixture(t),
    tracking = install(f),
    runtime = await started(f),
    execute = f.client.proposals.edits.execute;
  f.client.proposals.edits.execute = () => fail("conflict");
  await runtime.edit(target);
  assert.equal(runtime.getSnapshot().attempt.edit, undefined);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.load();
  f.client.proposals.edits.execute = (input) =>
    execute(input).pipe(Effect.andThen(fail("conflict")));
  await runtime.edit(target);
  assert.equal(runtime.getSnapshot().proposal.revision, "3");
  assert.equal(tracking.calls(), 1);
});

test("storage failure prevents generation and revoked session hides private proposal", async (t) => {
  const f = await fixture(t),
    tracking = install(f);
  await started(f);
  const runtime = f.create({
    ...f.store,
    stageProposalEdit: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
  });
  await runtime.load();
  await runtime.edit(target);
  assert.equal(tracking.calls(), 0);
  const next = f.create();
  await next.load();
  f.client.proposals.edits.execute = () => fail("forbidden");
  await next.edit(target);
  assert.equal(next.getSnapshot().access, "verify");
  assert.equal(next.getSnapshot().proposal, null);
  assert.equal(tracking.calls(), 0);
});

test("SQLite edit intents are immutable, account-leased and exclusive with approval/discard", async (t) => {
  const f = await fixture(t);
  install(f);
  await started(f);
  const command = { ...target, operationId: id(870) };
  await run(f.store.stageProposalEdit(f.session, { weekStart, command }));
  const { store } = f.reopen();
  assert.deepEqual((await run(store.readMealProposalAttempt(f.session, weekStart))).edit, command);
  await assert.rejects(
    run(
      store.stageProposalEdit(f.session, {
        weekStart,
        command: { ...command, entryId: id(951) },
      }),
    ),
    { reason: "pending_edit" },
  );
  const approval = { operationId: id(871), proposalId: target.proposalId, expectedRevision: "2" };
  await assert.rejects(
    run(store.stageProposalApproval(f.session, { weekStart, command: approval })),
    { reason: "pending_edit" },
  );
  await assert.rejects(
    run(store.stageProposalDiscard(f.session, { weekStart, command: approval })),
    { reason: "pending_edit" },
  );
  await assert.rejects(
    run(store.clearProposalEdit(f.session, { weekStart, operationId: id(872) })),
    { reason: "operation_reused" },
  );
  await run(store.clearProposalEdit(f.session, { weekStart, operationId: command.operationId }));
  await run(store.stageProposalApproval(f.session, { weekStart, command: approval }));
  await assert.rejects(run(store.stageProposalEdit(f.session, { weekStart, command })), {
    reason: "pending_edit",
  });
  const next = await run(store.activate(account, id(999)));
  await assert.rejects(run(store.stageProposalEdit(f.session, { weekStart, command })), {
    reason: "session_changed",
  });
  assert.ok(next);
});
