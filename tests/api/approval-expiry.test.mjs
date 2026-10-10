import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyRoute } from "../../apps/api/src/money/route.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Http = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "First" },
  token: "fixture",
};
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const value = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approvalId: id(100),
  operationId: id(101),
  command: "expenses.record",
  expiredUnused: true,
  checkedAt: "2026-09-28T08:00:00.000000Z",
};
const url = new URL(
  `http://localhost/v1/money/approval-expiry?approvalId=${id(100)}&operationId=${id(101)}&command=expenses.record`,
);
const run = (result, input = url) =>
  Effect.runPromise(
    moneyRoute(new Request(input), config, caller).pipe(
      Effect.provideService(Http.Fetch, async () => Response.json(result)),
    ),
  );
test("expiry API rejects substituted identities and malformed responses", async () => {
  assert.deepEqual(await run(value), value);
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { approvalId: id(102) },
    { operationId: id(103) },
    { command: "expenses.refund" },
    { expiredUnused: "true" },
    { checkedAt: "infinity" },
  ])
    await assert.rejects(run({ ...value, ...change }));
  await assert.rejects(run(value, new URL(url + "&approvalId=" + id(100))));
  await assert.rejects(run(value, new URL(url + "&actorId=" + id(1))));
});

test("recurring expiry requests retain exact configuration and state identity", async () => {
  for (const command of [
    "recurring.create",
    "recurring.update",
    "recurring.pause",
    "recurring.cancel",
  ]) {
    const input = new URL(url);
    input.searchParams.set("command", command);
    const result = { ...value, command };
    assert.deepEqual(await run(result, input), result);
    await assert.rejects(run({ ...result, command: "expenses.record" }, input));
  }
});
