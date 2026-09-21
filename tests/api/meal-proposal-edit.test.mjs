import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { proposalEditState } from "../../apps/api/src/meal-planning/edit-state.ts";
import { proposalEditWorker } from "../../apps/api/src/meal-planning/edit-worker.ts";
import { content, id, replacement } from "../database/meal-proposal-edit-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  FetchHttpClient = require("effect/unstable/http/FetchHttpClient");
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = { member: { userId: id(1), householdId: id(10), displayName: "A" }, token: "user" };
const command = {
  action: "replace",
  operationId: id(880),
  proposalId: id(800),
  expectedRevision: "2",
  entryId: id(950),
};
const edit = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  command,
  expiresAt: Date.now() + 120000,
  status: "pending",
  failure: null,
  receipt: null,
};
const claim = () => ({
  claimed: true,
  worker: { id: id(890), deadline: edit.expiresAt, stateHash: "a".repeat(64) },
  edit: structuredClone(edit),
  selection: null,
  envelope: {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    proposal: {
      ...content(),
      proposalId: id(800),
      revision: "2",
      weekRevision: "0",
      status: "ready",
      expiresAt: Date.now() + 86400000,
      failure: null,
    },
  },
});
const applied = () => ({
  ...structuredClone(edit),
  status: "applied",
  receipt: {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    ...command,
    previousRevision: "2",
    revision: "3",
  },
});
function result() {
  const r = applied();
  delete r.receipt.expectedRevision;
  return r;
}

test("owner edit adapter rejects mismatched response identities, command and receipt bindings", async () => {
  const run = (input, fetch) =>
    Effect.runPromise(
      proposalEditState(config, caller)
        .begin(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    );
  const fetch = async (url, init) => {
    assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_begin_proposal_edit");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer user");
    assert.equal(init.redirect, "error");
    const { operationId, ...p_input } = command;
    assert.deepEqual(JSON.parse(init.body), {
      p_household: id(10),
      p_operation: operationId,
      p_input,
    });
    return Response.json(edit);
  };
  assert.deepEqual(await run(command, fetch), edit);
  for (const patch of [{ approved: true }, { actorId: id(2) }, { expectedRevision: "0" }])
    await assert.rejects(
      run({ ...command, ...patch }, () => assert.fail("request before validation")),
      { code: "invalid_request" },
    );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { command: { ...command, entryId: id(953) } },
    { command: { ...command, expectedRevision: "3" } },
    { worker: "private" },
  ])
    await assert.rejects(
      run(command, async () => Response.json({ ...edit, ...patch })),
      { code: "unavailable" },
    );
  for (const patch of [
    { entryId: id(953) },
    { action: "choose", definitionId: id(200), expectedLibraryRevision: "1" },
    { previousRevision: "3", revision: "4" },
    { operationId: id(881) },
  ]) {
    const raw = result();
    raw.receipt = { ...raw.receipt, ...patch };
    await assert.rejects(
      run(command, async () => Response.json(raw)),
      { code: "unavailable" },
    );
  }
});

test("worker claim binds owner, exact operation, deadline and selection before provider dispatch", async () => {
  const worker = (raw) =>
    proposalEditWorker((method, args) => {
      assert.equal(method, "editClaim");
      assert.deepEqual(args, {
        p_actor: id(1),
        p_household: id(10),
        p_operation: id(880),
        p_worker: id(890),
      });
      return Effect.succeed(raw);
    }, caller);
  assert.equal((await Effect.runPromise(worker(claim()).claim(edit, id(890)))).claimed, true);
  for (const mutate of [
    (r) => {
      r.worker.id = id(891);
    },
    (r) => {
      r.worker.deadline++;
    },
    (r) => {
      r.envelope.actorId = id(2);
    },
    (r) => {
      r.envelope.proposal.revision = "3";
    },
    (r) => {
      r.edit.command.entryId = id(953);
    },
    (r) => {
      r.edit.expiresAt++;
    },
    (r) => {
      r.selection = content().entries[0].source;
    },
    (r) => {
      r.claimed = false;
    },
  ]) {
    const raw = claim();
    mutate(raw);
    await assert.rejects(Effect.runPromise(worker(raw).claim(edit, id(890))), {
      code: "unavailable",
    });
  }
});

test("worker completion rejects nonterminal and contradictory responses", async () => {
  const worker = (raw) => proposalEditWorker(() => Effect.succeed(raw), caller);
  const outcome = { entry: replacement(), failure: null };
  assert.deepEqual(
    await Effect.runPromise(worker(result()).finish(edit, id(890), outcome)),
    result(),
  );
  for (const raw of [
    edit,
    { ...result(), expiresAt: edit.expiresAt + 1 },
    { ...result(), actorId: id(2) },
    { ...edit, status: "failed", failure: "no_suitable_meals" },
  ])
    await assert.rejects(Effect.runPromise(worker(raw).finish(edit, id(890), outcome)), {
      code: "unavailable",
    });
  await assert.rejects(
    Effect.runPromise(
      worker(result()).finish(edit, id(890), { entry: null, failure: "unavailable" }),
    ),
    { code: "unavailable" },
  );
});
