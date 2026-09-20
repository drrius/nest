import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { setupClient } from "../../src/setup/client.ts";
import { SetupRuntime } from "../../src/setup/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920072531_native_notification_preferences.sql",
    "supabase/migrations/20260920041525_native_food_preferences.sql",
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
    setupClient(
      address,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
test("native setup is independent per person, refreshes saved forms and clears revoked access", async (t) => {
  const { remote, url, connect } = await backend(t);
  const first = new SetupRuntime(connect()),
    partner = new SetupRuntime(connect(url, id(2), remote.partnerBearer));
  t.after(() => {
    first.dispose();
    partner.dispose();
  });
  await first.load();
  assert.equal(first.getSnapshot().status.foodConfigured, false);
  remote.db
    .sql(`insert into public.nest_food_profiles(actor_id,household_id,revision,restrictions,dislikes,calorie_goal,portions) values('${id(2)}','${id(10)}',1,array['Secret'],array[]::text[],2345,1);
 insert into public.nest_cooking_preferences(household_id,revision,cooking_notes,meal_slots) values('${id(10)}',1,'Shared',array['dinner']);
 insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled) values('${id(1)}','${id(10)}',1,false,'08:00',false);`);
  await first.load();
  await partner.load();
  assert.deepEqual(first.getSnapshot().status, {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    foodConfigured: false,
    cookingConfigured: true,
    notificationsConfigured: true,
  });
  assert.equal(partner.getSnapshot().status.foodConfigured, true);
  assert.equal(partner.getSnapshot().status.notificationsConfigured, false);
  assert.ok(!JSON.stringify(first.getSnapshot()).includes("2345"));
  remote.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await first.load();
  assert.equal(first.getSnapshot().status, null);
  assert.equal(first.getSnapshot().verify, true);
});
