import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { account } from "./offline-fixture.mjs";
const week = "2026-09-21";
const credentials = {
  access_token: "fixture",
  refresh_token: "fixture",
  user: { id: account.actor },
};
const snapshot = {
  version: 1,
  householdId: account.household,
  weekStart: week,
  revision: "0",
  entries: [],
};
const execute = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const client = mealClient("http://localhost/", account, Effect.succeed(credentials));

test("native meal requests use the selected week, bearer and verified household", async () => {
  assert.deepEqual(
    await execute(client.read(week), async (url, options) => {
      assert.equal(new URL(url).pathname, "/v1/meals/week");
      assert.equal(new URL(url).searchParams.get("weekStart"), week);
      assert.equal(new Headers(options.headers).get("x-nest-household"), account.household);
      assert.equal(new Headers(options.headers).get("authorization"), "Bearer fixture");
      return Response.json(snapshot);
    }),
    snapshot,
  );
});

test("invalid input and switched credentials cannot dispatch; wrong-week/household data cannot render", async () => {
  await assert.rejects(
    execute(client.read("2026-09-22"), () => assert.fail("dispatched")),
    { code: "invalid" },
  );
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: "different" } }),
  );
  await assert.rejects(
    execute(switched.read(week), () => assert.fail("dispatched")),
    { code: "session" },
  );
  for (const patch of [
    { weekStart: "2026-09-28" },
    { householdId: "20000000-0000-4000-8000-000000000002" },
  ]) {
    await assert.rejects(
      execute(client.read(week), async () => Response.json({ ...snapshot, ...patch })),
      { code: "forbidden" },
    );
  }
  await assert.rejects(
    execute(client.read(week), async () => Response.json({ ...snapshot, entries: [{}] })),
    { code: "unavailable" },
  );
});
