import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { account } from "./offline-fixture.mjs";
import { id, page, recipe } from "./meal-library-fixture.mjs";
const credentials = {
  access_token: "fixture",
  refresh_token: "fixture",
  user: { id: account.actor },
};
const client = mealClient("http://localhost/", account, Effect.succeed(credentials)).library;
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("native library and detail reads bind current account, canonical identity and exact pagination revision", async () => {
  assert.deepEqual(
    await run(client.read(id(50).toUpperCase(), "9007199254740993"), async (url, options) => {
      assert.equal(new URL(url).pathname, "/v1/meals/library");
      assert.equal(new URL(url).searchParams.get("afterId"), id(50));
      assert.equal(new URL(url).searchParams.get("expectedRevision"), "9007199254740993");
      assert.equal(new Headers(options.headers).get("x-nest-household"), account.household);
      return Response.json(page("9007199254740993", 51));
    }),
    page("9007199254740993", 51),
  );
  assert.deepEqual(
    await run(client.recipe(id(1).toUpperCase(), "0"), async (url) => {
      assert.equal(new URL(url).searchParams.get("definitionId"), id(1));
      return Response.json(recipe());
    }),
    recipe(),
  );
});

test("native read clients reject switched credentials and inconsistent response identity, revision or cursor", async () => {
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: "other" } }),
  ).library;
  await assert.rejects(
    run(switched.read(), () => assert.fail("dispatched")),
    { code: "session" },
  );
  await assert.rejects(
    run(client.read(id(1)), () => assert.fail("dispatched")),
    { code: "invalid" },
  );
  for (const value of [page("1", 51), page("0", 50)]) {
    await assert.rejects(
      run(client.read(id(50), "0"), async () => Response.json(value)),
      { code: "unavailable" },
    );
  }
  await assert.rejects(
    run(client.read(), async () => Response.json({ ...page(), householdId: id(99) })),
    { code: "forbidden" },
  );
  for (const value of [
    recipe("1"),
    { ...recipe(), recipe: { ...recipe().recipe, definitionId: id(2) } },
  ]) {
    await assert.rejects(
      run(client.recipe(id(1), "0"), async () => Response.json(value)),
      { code: "unavailable" },
    );
  }
  await assert.rejects(
    run(client.recipe(id(1), "0"), async () => Response.json({ ...recipe(), householdId: id(99) })),
    { code: "forbidden" },
  );
});
