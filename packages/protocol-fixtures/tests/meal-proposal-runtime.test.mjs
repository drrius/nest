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
  account,
} from "./meal-proposal-fixture.mjs";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
const unavailable = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));

test("native generation durably records reservation before dispatch and restart only reads the ready preview", async (t) => {
  const f = await fixture(t),
    runtime = f.create(),
    generate = f.client.proposals.generate;
  f.client.proposals.generate = (input) =>
    Effect.gen(function* () {
      const saved = yield* f.store.readMealProposalAttempt(f.session, weekStart).pipe(Effect.orDie);
      assert.equal(saved.proposalId, receipt.proposalId);
      assert.deepEqual(saved.generation, input);
      return yield* generate(input);
    });
  await runtime.load();
  await runtime.start(false);
  assert.equal(runtime.getSnapshot().proposal.status, "ready");
  assert.equal(f.calls.generate, 1);
  runtime.dispose();
  const reopened = f.reopen(),
    next = f.create(reopened.store);
  await next.load();
  assert.equal(next.getSnapshot().proposal.status, "ready");
  assert.equal(f.calls.generate, 1);
});

test("reservation or metadata failure cannot dispatch a model; exact continuation preserves the operation", async (t) => {
  const f = await fixture(t),
    reserve = f.client.proposals.reserve;
  f.client.proposals.reserve = unavailable;
  const runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  assert.equal(f.calls.generate, 0);
  assert.equal(runtime.getSnapshot().attempt.generation.operationId, command.operationId);
  f.client.proposals.reserve = reserve;
  const store = {
    ...f.store,
    recordMealProposal: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
  };
  const blocked = f.create(store);
  await blocked.load();
  await blocked.continue();
  assert.equal(f.calls.generate, 0);
  await runtime.continue();
  assert.equal(f.calls.generate, 1);
});

test("uncertain generation recovers ready state without another model request", async (t) => {
  const f = await fixture(t),
    generate = f.client.proposals.generate;
  f.client.proposals.generate = (input) => generate(input).pipe(Effect.flatMap(unavailable));
  const runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(f.calls.generate, 1);
  await runtime.continue();
  assert.equal(runtime.getSnapshot().proposal.status, "ready");
  assert.equal(f.calls.generate, 1);
});

test("discard confirmation binds the displayed revision and lost acknowledgment recovers without resending", async (t) => {
  const f = await fixture(t),
    runtime = f.create(),
    discard = f.client.proposals.discard;
  await runtime.load();
  await runtime.start(false);
  await runtime.discard("2", id(999));
  await runtime.discard("1", ready.proposal.proposalId);
  assert.equal(f.calls.discard, 0);
  f.client.proposals.discard = (input) => discard(input).pipe(Effect.flatMap(unavailable));
  await runtime.discard("2", ready.proposal.proposalId);
  assert.equal(f.calls.discard, 1);
  await runtime.continue();
  assert.equal(runtime.getSnapshot().proposal.status, "discarded");
  assert.equal(f.calls.discard, 1);
  await runtime.reset();
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(await run(f.store.readMealProposalAttempt(f.session, weekStart)), null);
});

test("account switch stops late generation and hides private content while preserving scoped recovery", async (t) => {
  const f = await fixture(t),
    runtime = f.create(),
    reserve = f.client.proposals.reserve;
  f.client.proposals.reserve = (input) =>
    Effect.gen(function* () {
      const result = yield* reserve(input);
      yield* f.store.activate({ ...account, actor: id(2) }, id(850)).pipe(Effect.orDie);
      return result;
    });
  await runtime.load();
  await runtime.start(false);
  assert.equal(f.calls.generate, 0);
  assert.equal(runtime.getSnapshot().access, "verify");
  assert.equal(runtime.getSnapshot().proposal, null);
  const session = await run(f.store.activate(account, id(851)));
  f.client.proposals.reserve = reserve;
  const next = f.create(f.store, session);
  await next.load();
  assert.equal(next.getSnapshot().attempt.generation.operationId, command.operationId);
});

test("loading and disposal do not regenerate pending proposals or reset unfinished requests", async (t) => {
  const f = await fixture(t);
  await run(f.store.stageMealProposal(f.session, command));
  await run(f.store.recordMealProposal(f.session, receipt));
  f.setCurrent(pending);
  const runtime = f.create();
  await runtime.load();
  await runtime.reset();
  assert.equal(f.calls.generate, 0);
  assert.ok(runtime.getSnapshot().attempt);
  runtime.dispose();
  f.setCurrent(ready);
  await runtime.continue();
  assert.equal(f.calls.generate, 0);
});

test("loading a newer local request drops the prior proposal before comparing revisions", async (t) => {
  const f = await fixture(t),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  await run(
    f.store.clearMealProposalAttempt(f.session, { weekStart, operationId: command.operationId }),
  );
  const generation = { ...command, operationId: id(801) },
    start = { ...receipt, ...generation, proposalId: id(901) };
  await run(f.store.stageMealProposal(f.session, generation));
  await run(f.store.recordMealProposal(f.session, start));
  f.setCurrent({ ...pending, proposal: { ...pending.proposal, proposalId: id(901) } });
  await runtime.load();
  assert.equal(runtime.getSnapshot().proposal.proposalId, id(901));
  assert.equal(runtime.getSnapshot().proposal.revision, "1");
  assert.equal(runtime.getSnapshot().proposal.entries, null);
});
