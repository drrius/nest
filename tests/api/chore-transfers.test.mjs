import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { choreTransfers } from "../../apps/api/src/chores/transfers.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const command = {
  operationId: id(100),
  occurrenceId: id(50),
  expectedDueDate: "2026-09-20",
  recipientId: id(2),
};
const item = {
  requestId: id(60),
  occurrenceId: id(50),
  dueDate: command.expectedDueDate,
  fromMemberId: id(1),
  toMemberId: id(2),
  title: "Kitchen",
};
const { title: _title, ...identity } = item;
const receipt = {
  ...identity,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  action: "request",
  state: "pending",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("handover API binds actor scope and lowercases input UUIDs for exact request and response receipts", async () => {
  const api = choreTransfers(config, caller);
  const upper = Object.fromEntries(
    Object.entries(command).map(([key, value]) => [key, value.toUpperCase()]),
  );
  assert.deepEqual(
    await run(api.request(upper), async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_chore_transfer");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: id(100),
        p_action: "request",
        p_input: {
          occurrenceId: id(50),
          expectedDueDate: command.expectedDueDate,
          recipientId: id(2),
        },
      });
      return Response.json(receipt);
    }),
    receipt,
  );
  for (const action of ["accept", "decline"]) {
    const result = {
      ...receipt,
      actorId: id(2),
      action,
      state: action === "accept" ? "accepted" : "declined",
    };
    const partner = choreTransfers(config, {
      ...caller,
      member: { ...caller.member, userId: id(2) },
    });
    assert.deepEqual(
      await run(
        partner.respond({ operationId: id(100), requestId: id(60), action }),
        async (_url, init) => {
          assert.deepEqual(JSON.parse(init.body).p_input, { requestId: id(60) });
          return Response.json(result);
        },
      ),
      result,
    );
  }
});
test("handover API rejects hidden scope and mismatched identity, target, consenting actor and result state", async () => {
  const api = choreTransfers(config, caller);
  for (const patch of [{ householdId: id(11) }, { actorId: id(2) }, { action: "accept" }])
    await assert.rejects(
      run(api.request({ ...command, ...patch }), () => assert.fail("invalid command dispatched")),
      { code: "invalid_request" },
    );
  for (const patch of [
    { householdId: id(11) },
    { actorId: id(2) },
    { operationId: id(101) },
    { occurrenceId: id(51) },
    { dueDate: "2026-09-21" },
    { toMemberId: id(3) },
    { state: "accepted" },
    { hidden: true },
  ])
    await assert.rejects(
      run(api.request(command), async () => Response.json({ ...receipt, ...patch })),
      { code: "unavailable" },
    );
  const response = { operationId: id(100), requestId: id(60), action: "decline" };
  const declined = {
    ...receipt,
    fromMemberId: id(2),
    toMemberId: id(1),
    action: "decline",
    state: "declined",
  };
  for (const patch of [
    { requestId: id(61) },
    { action: "accept", state: "accepted" },
    { fromMemberId: id(1), toMemberId: id(2) },
  ])
    await assert.rejects(
      run(api.respond(response), async () => Response.json({ ...declined, ...patch })),
      { code: "unavailable" },
    );
});
test("pending lists are bounded, unique, strict and tied to the verified two-member roster", async () => {
  const api = choreTransfers(config, caller);
  const members = [caller.member, { ...caller.member, userId: id(2), displayName: "B" }];
  const fetch = (rows) => async (url) =>
    Response.json(new URL(url).pathname === "/rest/v1/household_members" ? members : rows, {
      headers: { "content-range": "0-1/2" },
    });
  assert.deepEqual(await run(api.list(), fetch([item])), {
    transfers: [item],
    members: [
      { actorId: id(1), displayName: "A" },
      { actorId: id(2), displayName: "B" },
    ],
  });
  for (const rows of [
    [item, item],
    [item, { ...item, requestId: id(61) }],
    [{ ...item, toMemberId: id(3) }],
    [{ ...item, hidden: true }],
    Array(201).fill(item),
  ])
    await assert.rejects(run(api.list(), fetch(rows)), { code: "unavailable" });
});

test("snapshot API makes a single scoped RPC and rejects malformed or internally inconsistent data", async () => {
  const { choreSnapshot } = await import("../../apps/api/src/chores/snapshot.ts");
  const chore = {
    occurrenceId: item.occurrenceId,
    dueDate: item.dueDate,
    title: item.title,
    assigneeId: id(1),
  };
  const snapshot = {
    version: 1,
    householdId: id(10),
    chores: [chore],
    transfers: [item],
    members: [
      { actorId: id(1), displayName: "A" },
      { actorId: id(2), displayName: "B" },
    ],
  };
  let calls = 0;
  assert.deepEqual(
    await run(choreSnapshot(config, caller), async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_chore_snapshot");
      assert.deepEqual(JSON.parse(init.body), { p_household: id(10) });
      return Response.json(snapshot);
    }),
    snapshot,
  );
  assert.equal(calls, 1);
  for (const patch of [
    { householdId: id(11) },
    { chores: [{ ...chore, assigneeId: id(2) }] },
    { chores: [] },
    { members: [snapshot.members[1]] },
    { chores: Array(201).fill(chore) },
    { hidden: true },
  ])
    await assert.rejects(
      run(choreSnapshot(config, caller), async () => Response.json({ ...snapshot, ...patch })),
      { code: "unavailable" },
    );
});
