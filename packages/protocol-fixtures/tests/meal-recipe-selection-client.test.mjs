import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mealClient } from "../src/meals/client.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const client = mealClient(
  config.url,
  { actor: caller.member.userId, household: caller.member.householdId },
  Effect.succeed({
    user: { id: caller.member.userId },
    access_token: "fixture",
    refresh_token: "fixture",
  }),
);
const { placeRecipe, replaceWithRecipe } = client;
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
  Effect.runPromise(fn(value).pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("native selection clients send exact requests and bind canonical receipt identities and revisions", async () => {
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
        assert.equal(new URL(url).pathname, `/v1/meals/recipe/${replace ? "replace" : "place"}`);
        assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
        assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
        assert.deepEqual(JSON.parse(init.body), command);
        return Response.json({ version: 1, receipt: saved });
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
        run(fn, command, async () =>
          Response.json({ version: 1, receipt: { ...saved, ...patch } }),
        ),
        { code: "unavailable" },
      );
  }
});
test("native selection clients reject injected recipe content and identities before dispatch", async () => {
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
      code: "invalid",
    });
  await assert.rejects(run(replaceWithRecipe, input, fetch), { code: "invalid" });
  assert.equal(calls, 0);
});

test("planned read binds the exact week, revision, entry and household without losing historical unknowns", async () => {
  const target = {
    entryId: "ABCDEF00-0000-4000-8000-000000000200",
    weekStart: "2030-01-07",
    revision: "9007199254740993",
  };
  const result = {
    version: 1,
    householdId: id(10),
    weekStart: target.weekStart,
    revision: target.revision,
    entry: {
      entryId: target.entryId.toLowerCase(),
      definitionId: null,
      leftoverSourceId: null,
      date: target.weekStart,
      slot: "dinner",
      title: "Soup",
      recipeUrl: null,
      notes: null,
    },
    snapshot: null,
  };
  assert.deepEqual(
    await run(client.plannedRecipe, target, async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, "/v1/meals/planned-recipe");
      assert.deepEqual(Object.fromEntries(parsed.searchParams), {
        ...target,
        entryId: target.entryId.toLowerCase(),
      });
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      return Response.json(result);
    }),
    result,
  );
  for (const patch of [
    { householdId: id(20) },
    { revision: "9007199254740994" },
    { weekStart: "2030-01-14" },
    { entry: { ...result.entry, entryId: id(999) } },
    { entry: { ...result.entry, date: "2030-01-14" } },
    { hidden: true },
  ]) {
    await assert.rejects(
      run(client.plannedRecipe, target, async () => Response.json({ ...result, ...patch })),
    );
  }
  let dispatched = false;
  await assert.rejects(
    run(client.plannedRecipe, { ...target, actorId: id(1) }, async () => {
      dispatched = true;
      return Response.json(result);
    }),
    { code: "invalid" },
  );
  assert.equal(dispatched, false);
  assert.deepEqual(
    await run(client.plannedRecipe, target, async () => Response.json({ ...result, entry: null })),
    { ...result, entry: null },
  );
});
