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
  text: "Change chore",
};
const execute = assistantCommands(request, config, turn);
const command = {
  definitionId: "abcdef00-0000-4000-8000-000000000200",
  expectedRevision: "9007199254740993",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  definitionId: command.definitionId,
  revision: "9007199254740994",
};
function fetcher(value, calls = [], household = id(10)) {
  return async (url, init) => {
    if (new URL(url).pathname === "/auth/v1/user") return Response.json({ id: id(1) });
    if (new URL(url).pathname === "/rest/v1/household_members")
      return Response.json([{ user_id: id(1), household_id: household, display_name: "Fixture" }]);
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, value });
  };
}
const run = (tool, input, fetch) =>
  Effect.runPromise(
    execute(tool, input, "change").pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("AI archive receipt binds canonical recipe identity and exact bigint revision", async () => {
  const calls = [],
    value = { ...command, definitionId: command.definitionId.toUpperCase() };
  assert.deepEqual(await run("archiveRecipe", value, fetcher(receipt, calls)), receipt);
  assert.equal(calls[0].p_tool, "archiveRecipe");
  assert.deepEqual(calls[0].p_input, value);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { definitionId: id(201) },
    { revision: "9007199254740995" },
    { hidden: true },
  ])
    await assert.rejects(run("archiveRecipe", command, fetcher({ ...receipt, ...patch })), {
      code: "unavailable",
    });
});
test("AI archive rejects injected identities and invalid revisions before dispatch", async () => {
  const calls = [];
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(8) },
    { expectedRevision: "9223372036854775807" },
    { definitionId: "invalid" },
  ])
    await assert.rejects(run("archiveRecipe", { ...command, ...patch }, fetcher(receipt, calls)), {
      code: "unavailable",
    });
  assert.equal(calls.length, 0);
});
