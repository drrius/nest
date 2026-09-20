import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { setupStatus } from "../../apps/api/src/setup/service.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const service = setupStatus(
  { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  { member: { userId: id(1), householdId: id(10), displayName: "Fixture" }, token: "fixture" },
);
const run = (fetch) =>
  Effect.runPromise(service.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("setup exposes only configured booleans and keeps incomplete reads unknown", async () => {
  const read = await run(async (url, init) => {
    const u = new URL(url);
    assert.equal(init.method, "GET");
    assert.equal(u.searchParams.get("household_id"), `eq.${id(10)}`);
    if (u.pathname.endsWith("nest_cooking_preferences"))
      return Response.json(
        [
          {
            householdId: id(10),
            revision: "1",
            cookingNotes: "Private-looking cooking data",
            mealSlots: ["dinner"],
          },
        ],
        { headers: { "content-range": "0-0/1" } },
      );
    assert.equal(u.searchParams.get("actor_id"), `eq.${id(1)}`);
    return Response.json([], { headers: { "content-range": "*/0" } });
  });
  assert.deepEqual(read, {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    foodConfigured: false,
    cookingConfigured: true,
    notificationsConfigured: false,
  });
  await assert.rejects(
    run(async () => Response.json([], { headers: { "content-range": "*/1" } })),
    { code: "unavailable" },
  );
});
