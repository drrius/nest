import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { routineClient } from "../src/routines/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const client = routineClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const command = {
  operationId: id(100),
  definition: { title: "Clean", schedule: { kind: "daily" }, assignment: { policy: "shared" } },
};
const snapshot = {
  version: 1,
  householdId: id(10),
  routines: [],
  members: [
    { actorId: id(1), displayName: "First" },
    { actorId: id(2), displayName: "Second" },
  ],
};
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  routineId: id(50),
  version: "2026-09-20T08:00:00.000001Z",
  action: "create",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("routine requests require current matching credentials before network access", async () => {
  const wrong = routineClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "wrong" }),
  );
  for (const operation of [wrong.read(), wrong.create(command)])
    await assert.rejects(
      run(operation, () => assert.fail("network request")),
      { code: "session" },
    );
});
test("routine reads validate household, current roster, unique rows and bounded results", async () => {
  assert.deepEqual(await run(client.read(), async () => Response.json(snapshot)), snapshot);
  for (const patch of [
    { householdId: id(11) },
    { members: [snapshot.members[1]] },
    { members: [snapshot.members[0], snapshot.members[0]] },
  ]) {
    await assert.rejects(
      run(client.read(), async () => Response.json({ ...snapshot, ...patch })),
      { code: "forbidden" },
    );
  }
  const row = {
    routineId: id(50),
    version: receipt.version,
    definition: command.definition,
    state: "active",
  };
  await assert.rejects(
    run(client.read(), async () => Response.json({ ...snapshot, routines: [row, row] })),
    { code: "forbidden" },
  );
  await assert.rejects(
    run(client.read(), async () =>
      Response.json({
        ...snapshot,
        routines: Array.from({ length: 201 }, (_, i) => ({ ...row, routineId: id(1000 + i) })),
      }),
    ),
    { code: "unavailable" },
  );
});
test("routine create sends the command once and binds the full acknowledgment identity", async () => {
  assert.deepEqual(
    await run(client.create(command), async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), command);
      const headers = new Headers(init.headers);
      assert.equal(headers.get("authorization"), "Bearer fixture");
      assert.equal(headers.get("x-nest-household"), id(10));
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    { operationId: id(101) },
    { action: "edit" },
    { version: "2026-09-20T08:00:00.000Z" },
  ]) {
    await assert.rejects(
      run(client.create(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  }
  await assert.rejects(
    run(client.create({ ...command, hidden: true }), () => assert.fail("invalid dispatched")),
    { code: "invalid" },
  );
});
test("routine errors distinguish denial, conflicts and unknown network outcomes", async () => {
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [400, "invalid"],
    [503, "unavailable"],
  ])
    await assert.rejects(
      run(client.create(command), async () => Response.json({}, { status })),
      { code },
    );
});

test("native edit preserves the exact baseline and verifies routine-specific receipts", async () => {
  const input = {
    operationId: id(100),
    routineId: id(50),
    expectedVersion: receipt.version,
    patch: { schedule: { kind: "monthly", dayOfMonth: 31 } },
  };
  const saved = { ...receipt, action: "edit" };
  assert.deepEqual(
    await run(client.edit(input), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/routines/edit");
      assert.deepEqual(JSON.parse(init.body), input);
      return Response.json({ version: 1, receipt: saved });
    }),
    saved,
  );
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { routineId: id(51) },
    { action: "create" },
  ])
    await assert.rejects(
      run(client.edit(input), async () =>
        Response.json({ version: 1, receipt: { ...saved, ...change } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.edit({ ...input, patch: {} }), () => assert.fail("invalid dispatch")),
    { code: "invalid" },
  );
  const wrong = routineClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "wrong" }),
  );
  await assert.rejects(
    run(wrong.edit(input), () => assert.fail("wrong account dispatch")),
    { code: "session" },
  );
});
