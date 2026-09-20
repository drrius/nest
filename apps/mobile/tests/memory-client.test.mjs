import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { memoryClient } from "../src/memory/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = { access_token: "fixture", user: { id: account.actor } };
const client = memoryClient("http://localhost/", account, Effect.succeed(credentials));
const envelope = { version: 1, actorId: account.actor, householdId: account.household };
const command = {
  operationId: id(100),
  memoryId: id(101),
  expectedRevision: "0",
  content: "Private memory",
};
const approval = {
  id: id(102),
  operationId: command.operationId,
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
  change: { memoryId: command.memoryId, expectedRevision: "0", content: command.content },
};
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  memoryId: command.memoryId,
  revision: "1",
  removed: false,
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const respond = (body) => async () => Response.json(body);

test("private memory client scopes fresh credentials and rejects wrong-owner or duplicated memory reads", async () => {
  const memory = { id: command.memoryId, revision: "1", content: command.content };
  const result = await run(client.list(), async (url, init) => {
    assert.equal(new URL(url).pathname, "/v1/memories");
    assert.equal(init.headers["x-nest-household"], account.household);
    assert.equal(init.redirect, "error");
    return Response.json({ ...envelope, memories: [memory] });
  });
  assert.deepEqual(result, [memory]);
  for (const patch of [{ actorId: id(2) }, { householdId: id(20) }, { memories: [memory, memory] }])
    await assert.rejects(
      run(client.list(), respond({ ...envelope, memories: [memory], ...patch })),
      { code: "unavailable" },
    );
  const changed = memoryClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(
    run(changed.list(), async () => assert.fail("must not send another account's credentials")),
    { code: "session" },
  );
});

test("proposal and approval responses must bind exact actor, operation, identity, revision and text", async () => {
  assert.deepEqual(
    await run(client.propose(command), respond({ ...envelope, approval })),
    approval,
  );
  for (const patch of [
    { operationId: id(103) },
    { change: { ...approval.change, content: "Different" } },
    { change: { ...approval.change, memoryId: id(104) } },
    { change: { ...approval.change, expectedRevision: "1" } },
  ])
    await assert.rejects(
      run(client.propose(command), respond({ ...envelope, approval: { ...approval, ...patch } })),
      { code: "unavailable" },
    );
  await assert.rejects(run(client.approval(id(105)), respond({ ...envelope, approval })), {
    code: "unavailable",
  });
  await assert.rejects(
    run(client.propose({ ...command, approved: true }), async () =>
      assert.fail("invalid dispatch"),
    ),
    { code: "invalid" },
  );
});

test("decision and removal clients cannot accept the wrong effect or a malformed scoped receipt", async () => {
  const input = { ...command, approvalId: approval.id, approved: true };
  assert.equal(
    (
      await run(
        client.decide(input),
        respond({ ...envelope, decision: { status: "consumed", receipt } }),
      )
    ).status,
    "consumed",
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(104) },
    { memoryId: id(105) },
    { revision: "2" },
    { removed: true },
  ])
    await assert.rejects(
      run(
        client.decide(input),
        respond({
          ...envelope,
          decision: { status: "consumed", receipt: { ...receipt, ...patch } },
        }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.decide(input), respond({ ...envelope, decision: { status: "denied" } })),
    { code: "unavailable" },
  );
  await assert.rejects(
    run(
      client.decide({ ...input, approved: false }),
      respond({ ...envelope, decision: { status: "consumed", receipt } }),
    ),
    { code: "unavailable" },
  );
  const remove = {
    operationId: command.operationId,
    memoryId: command.memoryId,
    expectedRevision: "1",
  };
  await assert.rejects(
    run(client.remove(remove), respond({ ...envelope, receipt: { ...receipt, revision: "2" } })),
    { code: "unavailable" },
  );
});
