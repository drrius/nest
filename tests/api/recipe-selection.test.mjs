import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { placeRecipe } from "../../apps/api/src/meals/recipe-placement.ts";
import { replaceWithRecipe } from "../../apps/api/src/meals/recipe-replacement.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const input = {
  operationId: "ABCDEF00-0000-4000-8000-000000000004",
  definitionId: "ABCDEF00-0000-4000-8000-000000000003",
  weekStart: "2030-01-07",
  date: "2030-01-07",
  slot: "dinner",
  expectedRevision: "9007199254740993",
  expectedLibraryRevision: "9007199254740989",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  definitionId: input.definitionId.toLowerCase(),
  entryId: id(600),
  weekStart: input.weekStart,
  date: input.date,
  slot: input.slot,
  libraryRevision: input.expectedLibraryRevision,
  revision: "9007199254740994",
};
const run = (fn, value, fetch) =>
  Effect.runPromise(fn(config, caller, value).pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("selection APIs canonicalize identifiers and bind every receipt identity and exact revision", async () => {
  for (const [fn, replace] of [
    [placeRecipe, false],
    [replaceWithRecipe, true],
  ]) {
    const command = replace ? { ...input, entryId: "ABCDEF00-0000-4000-8000-000000000009" } : input;
    const saved = replace
      ? {
          ...receipt,
          revision: "9007199254740995",
          previousEntryId: command.entryId.toLowerCase(),
          skippedPreparationId: null,
        }
      : receipt;
    assert.deepEqual(
      await run(fn, command, async (url, init) => {
        assert.equal(
          new URL(url).pathname,
          `/rest/v1/rpc/${replace ? "nest_replace_with_recipe" : "nest_place_recipe"}`,
        );
        const { operationId, ...payload } = command;
        assert.deepEqual(JSON.parse(init.body), {
          p_household: id(10),
          p_operation: operationId.toLowerCase(),
          p_input: {
            ...payload,
            definitionId: command.definitionId.toLowerCase(),
            ...(replace ? { entryId: command.entryId.toLowerCase() } : {}),
          },
        });
        return Response.json(saved);
      }),
      saved,
    );
    for (const patch of [
      { actorId: id(2) },
      { householdId: id(20) },
      { operationId: id(1) },
      { definitionId: id(2) },
      { weekStart: "2030-01-14" },
      { date: "2030-01-08" },
      { slot: "lunch" },
      { libraryRevision: "0" },
      { revision: "9007199254740996" },
      { hidden: true },
      ...(replace ? [{ previousEntryId: id(8) }] : []),
    ])
      await assert.rejects(
        run(fn, command, async () => Response.json({ ...saved, ...patch })),
        { code: "unavailable" },
      );
  }
});
test("selection APIs reject injected recipe content and identities before dispatch", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return Response.json(receipt);
  };
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { title: "Injected" },
    { recipe: {} },
    { expectedLibraryRevision: "01" },
    { date: "2030-01-14" },
  ])
    await assert.rejects(run(placeRecipe, { ...input, ...patch }, fetch), {
      code: "invalid_request",
    });
  await assert.rejects(run(replaceWithRecipe, input, fetch), { code: "invalid_request" });
  assert.equal(calls, 0);
});
