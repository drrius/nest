import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { foodClient } from "../../src/food/client.ts";
import { FoodRuntime } from "../../src/food/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const preferences = { restrictions: ["Peanuts"], dislikes: [], calorieGoal: 2200, portions: 1.5 };
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920041525_native_food_preferences.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/`;
  const connect = (address = url, actor = account.actor, bearer = remote.bearer) =>
    foodClient(
      address,
      { ...account, actor },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
test("native food runtime retries a truly dropped committed HTTP acknowledgment and cold-reopens canonical private data", async (t) => {
  const { remote, url, connect } = await backend(t);
  const proxy = await lostResponseProxy(t, url, "/v1/food-preferences/save");
  const runtime = new FoodRuntime(connect(proxy.url), () => id(100));
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().loaded, true);
  assert.equal(runtime.getSnapshot().profile, null);
  await runtime.save(preferences);
  assert.equal(proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(remote.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  await runtime.retry();
  assert.equal(runtime.getSnapshot().stage, "form");
  assert.deepEqual(runtime.getSnapshot().profile, { revision: "1", preferences });
  assert.equal(remote.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  runtime.dispose();
  const reopened = new FoodRuntime(connect(), () => id(101));
  t.after(() => reopened.dispose());
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().profile, { revision: "1", preferences });
  assert.equal(await Effect.runPromise(connect(url, id(2), remote.partnerBearer).read()), null);
});
test("two native forms cannot overwrite a newer profile; revocation clears the old form and forbids retries", async (t) => {
  const { remote, connect } = await backend(t);
  const first = new FoodRuntime(connect(), () => id(100)),
    second = new FoodRuntime(connect(), () => id(101));
  t.after(() => {
    first.dispose();
    second.dispose();
  });
  await first.load();
  await second.load();
  await first.save(preferences);
  await second.save({ ...preferences, calorieGoal: null });
  assert.equal(second.getSnapshot().stage, "conflict");
  assert.equal(remote.db.sql("select calorie_goal from public.nest_food_profiles"), "2200");
  await second.load();
  assert.equal(second.getSnapshot().profile.revision, "1");
  // A conflict did not commit an operation, so this same identity can now be used with the reviewed revision.
  await second.save({ ...preferences, calorieGoal: null });
  assert.equal(second.getSnapshot().profile.revision, "2");
  assert.equal(second.getSnapshot().profile.preferences.calorieGoal, null);
  remote.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await second.load();
  assert.equal(second.getSnapshot().stage, "verify");
  assert.equal(second.getSnapshot().profile, null);
  await second.retry();
  await second.save(preferences);
  assert.equal(remote.db.sql("select count(*) from public.nest_food_profile_receipts"), "2");
});
