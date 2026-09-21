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
  weekStart: "2030-01-07",
  date: "2030-01-07",
  slot: "dinner",
  definitionId: "ABCDEF00-0000-4000-8000-000000000200",
  expectedRevision: "9007199254740993",
  expectedLibraryRevision: "9",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  definitionId: command.definitionId.toLowerCase(),
  entryId: id(300),
  weekStart: command.weekStart,
  date: command.date,
  slot: command.slot,
  revision: "9007199254740994",
  libraryRevision: "9",
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

test("AI selection validates exact receipt identity, destination and independent bigint revisions", async () => {
  for (const action of ["placeRecipe", "replaceWithRecipe"]) {
    const replace = action === "replaceWithRecipe";
    const value = replace
      ? { ...command, entryId: "ABCDEF00-0000-4000-8000-000000000201" }
      : command;
    const saved = replace
      ? {
          ...receipt,
          previousEntryId: value.entryId.toLowerCase(),
          skippedPreparationId: null,
          revision: "9007199254740995",
        }
      : receipt;
    const calls = [];
    assert.deepEqual(await run(action, value, fetcher(saved, calls)), saved);
    assert.deepEqual(calls[0].p_input, value);
    assert.equal(calls[0].p_tool, action);
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(20) },
      { definitionId: id(201) },
      { revision: "9007199254740996" },
      { libraryRevision: "10" },
      { date: "2030-01-08" },
      { weekStart: "2030-01-14" },
      { slot: "lunch" },
      { hidden: true },
      ...(replace ? [{ previousEntryId: id(99) }] : []),
    ])
      await assert.rejects(run(action, value, fetcher({ ...saved, ...patch })), {
        code: "unavailable",
      });
    for (const patch of [
      { actorId: id(2) },
      { operationId: id(99) },
      { title: "Injected" },
      { expectedLibraryRevision: "-1" },
    ])
      await assert.rejects(run(action, { ...value, ...patch }, fetcher(saved, calls)), {
        code: "unavailable",
      });
    assert.equal(calls.length, 1);
  }
});
