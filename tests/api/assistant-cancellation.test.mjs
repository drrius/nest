import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { cancelUnstartedTurn } from "../../apps/api/src/assistant/cancel.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "Alex" },
};
const identity = { conversationId: id(100), operationId: id(101) };
function run(body, result, seen) {
  return Effect.runPromise(
    cancelUnstartedTurn(
      new Request("https://nest.invalid/v1/assistant/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { url: "https://fixture.invalid", publishableKey: "sb_publishable_fixture" },
      caller,
    ).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (input, init) => {
        const request = new Request(input, init);
        seen.push({ url: request.url, body: await request.json() });
        return Response.json(result);
      }),
    ),
  );
}
test("cancellation binds RPC scope and exact identity without interpreting started as cancelled", async () => {
  for (const cancelled of [true, false]) {
    const seen = [];
    const response = await run(identity, { cancelled }, seen);
    assert.deepEqual(await response.json(), {
      version: 1,
      actorId: id(1),
      householdId: id(10),
      ...identity,
      cancelled,
    });
    assert.deepEqual(seen[0].body, {
      p_household: id(10),
      p_conversation: id(100),
      p_operation: id(101),
    });
    assert.ok(seen[0].url.endsWith("/rest/v1/rpc/nest_cancel_unstarted_ai_turn"));
  }
});
test("invalid identities and malformed cancellation responses fail closed", async () => {
  const seen = [];
  await assert.rejects(run({ ...identity, actorId: id(2) }, { cancelled: true }, seen), {
    code: "invalid_request",
  });
  assert.equal(seen.length, 0);
  await assert.rejects(run(identity, { cancelled: "true" }, seen), { code: "unavailable" });
});
