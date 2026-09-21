import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { PlannedRecipeRuntime } from "../../apps/mobile/src/meals/planned-recipe-runtime.ts";
import { fixture as sqliteFixture } from "../../apps/mobile/tests/offline-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import {
  oneOffFiles,
  oneOffRecipe,
  seedOneOff,
  id,
  week,
} from "../database/one-off-recipe-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect");
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...oneOffFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  seedOneOff(remote.db);
  let unavailable = false;
  const handler = createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" });
  const server = nodeServer((request) =>
    unavailable ? Promise.resolve(new Response(null, { status: 503 })) : handler(request),
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
  const client = mealClient(
    url,
    { actor: id(1), household: id(10) },
    Effect.succeed({
      access_token: remote.bearer,
      refresh_token: "fixture",
      user: { id: id(1) },
    }),
  );
  return {
    remote,
    client,
    setUnavailable: (value) => {
      unavailable = value;
    },
  };
}
test("native one-off recipe detail reads real storage, survives cache restart and service failure, then clears on revocation", async (t) => {
  const f = await backend(t),
    sqlite = await sqliteFixture(t);
  const session = await Effect.runPromise(
    sqlite.store.activate({ actor: id(1), household: id(10) }, id(900)),
  );
  const target = { weekStart: week, revision: "1", entryId: id(940) };
  const runtime = new PlannedRecipeRuntime(f.client, { store: sqlite.store, session }, target);
  await runtime.load();
  assert.equal(runtime.getSnapshot().fresh, true);
  assert.deepEqual(runtime.getSnapshot().snapshot.snapshot, {
    libraryRevision: null,
    recipe: oneOffRecipe,
  });
  runtime.dispose();
  const reopened = sqlite.reopen();
  f.setUnavailable(true);
  const cached = new PlannedRecipeRuntime(f.client, { store: reopened.store, session }, target);
  t.after(() => cached.dispose());
  await cached.load();
  assert.equal(cached.getSnapshot().fresh, false);
  assert.deepEqual(cached.getSnapshot().snapshot.snapshot.recipe, oneOffRecipe);
  assert.match(cached.getSnapshot().notice, /Could not refresh/);
  f.setUnavailable(false);
  await cached.load();
  assert.equal(cached.getSnapshot().fresh, true);
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await cached.load();
  assert.equal(cached.getSnapshot().access, "verify");
  assert.equal(cached.getSnapshot().snapshot, null);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_definitions"), "3");
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
});
