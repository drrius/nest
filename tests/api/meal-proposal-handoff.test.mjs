import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { openProposal } from "../../apps/api/src/meal-planning/open-proposal.ts";
import { id, content } from "../database/meal-proposal-worker-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  FetchHttpClient = require("effect/unstable/http/FetchHttpClient");
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller = { member: { userId: id(1), householdId: id(10), displayName: "A" }, token: "user" };
const body = content();
const result = {
  version: 1,
  receipt: {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(800),
    proposalId: id(801),
    revision: "1",
    weekStart: body.weekStart,
    expectedWeekRevision: "0",
    familiarOnly: false,
  },
  envelope: {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    proposal: {
      ...body,
      proposalId: id(801),
      revision: "2",
      weekRevision: "0",
      status: "ready",
      failure: null,
      expiresAt: Date.now() + 86400000,
    },
  },
};
const run = (input, fetch) =>
  Effect.runPromise(
    openProposal(config, caller, input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("handoff adapter binds the requested owner/proposal and the original receipt to current content", async () => {
  assert.deepEqual(
    await run({ proposalId: id(801) }, async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_read_meal_proposal_origin");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer user");
      assert.deepEqual(JSON.parse(init.body), { p_household: id(10), p_proposal: id(801) });
      return Response.json(result);
    }),
    result,
  );
  for (const mutate of [
    (r) => {
      r.envelope.actorId = id(2);
      r.receipt.actorId = id(2);
    },
    (r) => {
      r.envelope.proposal.proposalId = id(802);
      r.receipt.proposalId = id(802);
    },
    (r) => {
      r.receipt.expectedWeekRevision = "1";
    },
    (r) => {
      r.receipt.familiarOnly = true;
    },
    (r) => {
      r.envelope.proposal.weekStart = "2030-01-14";
    },
    (r) => {
      r.workerId = id(900);
    },
  ]) {
    const raw = structuredClone(result);
    mutate(raw);
    await assert.rejects(
      run({ proposalId: id(801) }, async () => Response.json(raw)),
      { code: "unavailable" },
    );
  }
  for (const input of [{ proposalId: "invalid" }, { proposalId: id(801), operationId: id(999) }])
    await assert.rejects(
      run(input, () => assert.fail("Invalid input sent")),
      { code: "invalid_request" },
    );
});

test("unfinished handoff uses expiry only after a bound read and validates the recovered envelope", async () => {
  const generating = structuredClone(result);
  Object.assign(generating.envelope.proposal, {
    status: "generating",
    entries: null,
    revision: "1",
  });
  const paths = [];
  assert.deepEqual(
    await run({ proposalId: id(801) }, async (url) => {
      paths.push(new URL(url).pathname);
      return Response.json(paths.length === 1 ? generating : result);
    }),
    result,
  );
  assert.deepEqual(paths, [
    "/rest/v1/rpc/nest_read_meal_proposal_origin",
    "/rest/v1/rpc/nest_open_meal_proposal",
  ]);
  const wrongOwner = structuredClone(result);
  wrongOwner.receipt.actorId = id(2);
  wrongOwner.envelope.actorId = id(2);
  let calls = 0;
  await assert.rejects(
    run({ proposalId: id(801) }, async () =>
      Response.json(++calls === 1 ? generating : wrongOwner),
    ),
    { code: "unavailable" },
  );
  assert.equal(calls, 2);
});
