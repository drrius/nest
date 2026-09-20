import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { cookingClient } from "../../src/cooking/client.ts";
import { CookingRuntime } from "../../src/cooking/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const preferences = { cookingNotes: "Quick meals", mealSlots: ["dinner"] };
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920050551_native_cooking_preferences.sql",
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
  const connect = (address = url, actor = id(1), bearer = remote.bearer) =>
    cookingClient(
      address,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
test("lost shared-save acknowledgment reloads newer partner choices without replaying over them", async (t) => {
  const { remote, url, connect } = await backend(t);
  const proxy = await lostResponseProxy(t, url, "/v1/cooking-preferences/save");
  const first = new CookingRuntime(connect(proxy.url), () => id(100));
  const partner = new CookingRuntime(connect(url, id(2), remote.partnerBearer), () => id(101));
  t.after(() => {
    first.dispose();
    partner.dispose();
  });
  await first.load();
  assert.equal(first.getSnapshot().profile, null);
  await first.save(preferences);
  assert.equal(proxy.dropped(), 1);
  assert.equal(first.getSnapshot().stage, "uncertain");
  await partner.load();
  assert.equal(partner.getSnapshot().profile.revision, "1");
  const changed = { cookingNotes: "Cook together", mealSlots: ["lunch", "dinner"] };
  await partner.save(changed);
  assert.equal(partner.getSnapshot().profile.revision, "2");
  await first.retry();
  assert.equal(first.getSnapshot().stage, "form");
  assert.deepEqual(first.getSnapshot().profile, { revision: "2", preferences: changed });
  assert.equal(remote.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "2");
  first.dispose();
  const reopened = new CookingRuntime(connect(), () => id(102));
  t.after(() => reopened.dispose());
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().profile, partner.getSnapshot().profile);
});
test("native shared forms expose partner conflicts and clear state on lost household access", async (t) => {
  const { remote, url, connect } = await backend(t);
  const first = new CookingRuntime(connect(), () => id(100));
  const partner = new CookingRuntime(connect(url, id(2), remote.partnerBearer), () => id(101));
  t.after(() => {
    first.dispose();
    partner.dispose();
  });
  await first.load();
  await partner.load();
  await first.save(preferences);
  await partner.save({ cookingNotes: "Partner", mealSlots: ["lunch"] });
  assert.equal(partner.getSnapshot().stage, "conflict");
  await partner.save(preferences);
  assert.equal(remote.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
  await partner.load();
  assert.deepEqual(partner.getSnapshot().profile.preferences, preferences);
  remote.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(2)}'`,
  );
  await partner.load();
  assert.equal(partner.getSnapshot().stage, "verify");
  assert.equal(partner.getSnapshot().profile, null);
  await partner.save(preferences);
  assert.equal(remote.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
});
