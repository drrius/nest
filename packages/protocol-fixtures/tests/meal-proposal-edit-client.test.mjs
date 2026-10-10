import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { account, ready, id } from "./meal-proposal-fixture.mjs";
const client = mealClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ access_token: "user", refresh_token: "fixture", user: { id: account.actor } }),
);
const command = {
  action: "replace",
  operationId: id(880),
  proposalId: ready.proposal.proposalId,
  expectedRevision: "2",
  entryId: id(950),
};
const result = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  command,
  expiresAt: Date.now() + 120000,
  status: "pending",
  failure: null,
  receipt: null,
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("native edit client binds exact owner and command and never sends hidden approval/content", async () => {
  assert.deepEqual(
    await run(client.proposals.edits.execute(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/proposal/edit");
      assert.deepEqual(JSON.parse(init.body), command);
      return Response.json(result);
    }),
    result,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { command: { ...command, entryId: id(999) } },
    {
      command: {
        ...command,
        action: "choose",
        definitionId: id(200),
        expectedLibraryRevision: "1",
      },
    },
    { workerId: id(900) },
  ])
    await assert.rejects(
      run(client.proposals.edits.execute(command), async () =>
        Response.json({ ...result, ...patch }),
      ),
      { code: "unavailable" },
    );
  for (const patch of [
    { approved: true },
    { source: ready.proposal.entries[0].source },
    { actorId: id(2) },
  ])
    await assert.rejects(
      run(client.proposals.edits.execute({ ...command, ...patch }), () =>
        assert.fail("Invalid input sent"),
      ),
      { code: "invalid" },
    );
});

test("native edit recovery is operation-specific and private", async () => {
  assert.deepEqual(
    await run(client.proposals.edits.recover(command.operationId), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/proposal/edit/recover");
      assert.deepEqual(JSON.parse(init.body), { operationId: command.operationId });
      return Response.json(result);
    }),
    result,
  );
  for (const patch of [{ command: { ...command, operationId: id(999) } }, { actorId: id(2) }])
    await assert.rejects(
      run(client.proposals.edits.recover(command.operationId), async () =>
        Response.json({ ...result, ...patch }),
      ),
      { code: "unavailable" },
    );
});
