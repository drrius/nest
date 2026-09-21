import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { proposalWorker } from "../../apps/api/src/meal-planning/worker-store.ts";
import { content, id } from "../database/meal-proposal-worker-fixture.mjs";
import { MealProposalGenerationResult } from "../../packages/contracts/src/meal-proposals.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Schema = require("effect/Schema");
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "Member" },
  token: "user",
};
const proposal = {
  ...content(),
  entries: null,
  proposalId: id(800),
  revision: "1",
  weekRevision: "0",
  status: "generating",
  expiresAt: Date.now() + 86400000,
  failure: null,
};
const envelope = (patch = {}) => ({
  version: 1,
  actorId: id(1),
  householdId: id(10),
  proposal: { ...proposal, ...patch },
});
const claimed = () => ({
  claimed: true,
  worker: { id: id(850), deadline: Date.now() + 120000, stateHash: "a".repeat(64) },
  envelope: envelope(),
});

test("worker boundary rejects forged scope, worker, state and completion content", async () => {
  const check = (raw) =>
    proposalWorker((_method, args) => {
      assert.equal(args.p_actor, id(1));
      assert.equal(args.p_household, id(10));
      assert.equal(args.p_proposal, id(800));
      return Effect.succeed(raw);
    }, caller);
  assert.equal((await Effect.runPromise(check(claimed()).claim(proposal, id(850)))).claimed, true);
  for (const mutate of [
    (r) => {
      r.envelope.actorId = id(2);
    },
    (r) => {
      r.envelope.householdId = id(20);
    },
    (r) => {
      r.worker.id = id(851);
    },
    (r) => {
      r.envelope.proposal.revision = "2";
    },
    (r) => {
      r.claimed = false;
    },
    (r) => {
      r.rawContext = "private";
    },
  ]) {
    const raw = claimed();
    mutate(raw);
    await assert.rejects(Effect.runPromise(check(raw).claim(proposal, id(850))), {
      code: "unavailable",
    });
  }
  const ready = envelope({ status: "ready", revision: "2", entries: content().entries });
  assert.deepEqual(
    await Effect.runPromise(
      check(ready).finish(proposal, id(850), { content: content(), failure: null }),
    ),
    ready,
  );
  for (const mutate of [
    (r) => {
      r.proposal.entries[0].source.recipe.title = "Changed";
    },
    (r) => {
      r.proposal.weekRevision = "1";
    },
    (r) => {
      r.proposal.revision = "3";
    },
    (r) => {
      r.proposal.expiresAt++;
    },
    (r) => {
      r.proposal.status = "approved";
    },
  ]) {
    const raw = structuredClone(ready);
    mutate(raw);
    await assert.rejects(
      Effect.runPromise(
        check(raw).finish(proposal, id(850), { content: content(), failure: null }),
      ),
      { code: "unavailable" },
    );
  }
});

test("public generation response binds the current private preview to the immutable start receipt", () => {
  const value = {
    version: 1,
    envelope: envelope(),
    receipt: {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      operationId: id(900),
      proposalId: id(800),
      revision: "1",
      weekStart: proposal.weekStart,
      expectedWeekRevision: "0",
      familiarOnly: false,
    },
  };
  const decode = Schema.decodeUnknownSync(MealProposalGenerationResult);
  assert.deepEqual(decode(value, { onExcessProperty: "error" }), value);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { proposalId: id(801) },
    { familiarOnly: true },
    { expectedWeekRevision: "1" },
    { weekStart: "2030-01-14" },
  ])
    assert.throws(() => decode({ ...value, receipt: { ...value.receipt, ...patch } }));
});
