import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { assistantCommands } from "../../apps/api/src/assistant/commands.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = new Request("http://localhost/", {
  headers: { authorization: "Bearer fixture", "x-nest-household": id(10) },
});
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const turn = {
  conversationId: id(100),
  operationId: id(101),
  expectedRevision: "0",
  text: "Save preferences",
};
const command = {
  expectedRevision: "0",
  preferences: { cookingNotes: "", mealSlots: ["dinner"] },
};
const receipt = { actorId: id(1), householdId: id(10), operationId: id(102), revision: "1" };
const execute = assistantCommands(request, config, turn);
function fetcher(value, household = id(10), calls = []) {
  return async (url, init) => {
    if (new URL(url).pathname === "/auth/v1/user") return Response.json({ id: id(1) });
    if (new URL(url).pathname === "/rest/v1/household_members")
      return Response.json([{ user_id: id(1), household_id: household, display_name: "Fixture" }]);
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, value });
  };
}
const run = (fetch) =>
  Effect.runPromise(
    execute("saveCookingPreferences", command, "cooking-call").pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );
test("cooking journal adapter verifies saved actor, household and exact resulting revision", async () => {
  const calls = [];
  assert.deepEqual(await run(fetcher(receipt, id(10), calls)), receipt);
  assert.deepEqual(calls[0], {
    p_household: id(10),
    p_conversation: turn.conversationId,
    p_turn: turn.operationId,
    p_call: "cooking-call",
    p_tool: "saveCookingPreferences",
    p_input: command,
  });
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    { revision: "2" },
    { revision: 1 },
  ])
    await assert.rejects(run(fetcher({ ...receipt, ...patch })), { code: "unavailable" });
});
test("cooking journal adapter cannot follow membership into a different household", async () => {
  const calls = [];
  await assert.rejects(run(fetcher(receipt, id(11), calls)), { code: "forbidden" });
  assert.equal(calls.length, 0);
});
