import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { approveProposal } from "../../apps/api/src/meal-planning/approve.ts";
import { id, week } from "../database/meal-proposal-worker-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  FetchHttpClient = require("effect/unstable/http/FetchHttpClient");
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = { member: { userId: id(1), householdId: id(10), displayName: "A" }, token: "user" };
const command = { operationId: id(800), proposalId: id(801), expectedRevision: "2" };
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(800),
  proposalId: id(801),
  approvedRevision: "2",
  revision: "3",
  weekStart: week,
  previousWeekRevision: "0",
  weekRevision: "1",
  entries: [{ proposalEntryId: id(900), entryId: id(901), date: week, slot: "dinner" }],
};
const run = (input, fetch) =>
  Effect.runPromise(
    approveProposal(config, caller, input).pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );

test("approval HTTP adapter uses caller credentials and binds every receipt identity and approved revision", async () => {
  const fetch = async (url, init) => {
    assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_approve_meal_proposal");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer user");
    assert.equal(headers.get("apikey"), config.publishableKey);
    assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body), {
      p_household: id(10),
      p_operation: command.operationId,
      p_input: { proposalId: command.proposalId, expectedRevision: "2" },
    });
    return Response.json(receipt);
  };
  assert.deepEqual(await run(command, fetch), receipt);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(802) },
    { proposalId: id(803) },
    { approvedRevision: "3", revision: "4" },
    { weekRevision: "2" },
    { privateContext: "hidden" },
    { entries: [receipt.entries[0], receipt.entries[0]], weekRevision: "2" },
  ])
    await assert.rejects(
      run(command, async () => Response.json({ ...receipt, ...patch })),
      { code: "unavailable" },
    );
});

test("approval rejects injected input before I/O and maps database and transport failures without invented success", async () => {
  for (const patch of [
    { approved: true },
    { actorId: id(2) },
    { expectedRevision: "0" },
    { expectedRevision: 2 },
    { entries: [] },
  ])
    await assert.rejects(
      run({ ...command, ...patch }, () => assert.fail("Request before validation")),
      { code: "invalid_request" },
    );
  for (const [status, code, expected] of [
    [401, "auth", "unauthenticated"],
    [403, "auth", "forbidden"],
    [409, "40001", "conflict"],
    [400, "22023", "invalid_request"],
  ])
    await assert.rejects(
      run(command, async () => Response.json({ code }, { status })),
      { code: expected },
    );
  await assert.rejects(
    run(command, async () => {
      throw new Error("private upstream detail");
    }),
    (error) => {
      assert.equal(error.code, "unavailable");
      assert.equal(JSON.stringify(error).includes("private upstream"), false);
      return true;
    },
  );
});
