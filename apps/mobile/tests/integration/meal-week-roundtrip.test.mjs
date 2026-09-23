import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { mealClient } from "../../src/meals/client.ts";
import { MealWeekRuntime } from "../../src/meals/runtime.ts";
import { PreferenceFailure } from "../../src/preferences/client.ts";
import { fixture, run } from "../offline-fixture.mjs";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { mealWeekFiles } from "../../../../tests/database/meal-week-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const week = "2026-09-21";

test("native week controller reads real HTTP, restarts offline, refreshes partner edits and hides revoked data", async (t) => {
  const remote = await postgrestFixture(t, [
    ...mealWeekFiles,
    "tests/integration/food-postgrest.sql",
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
  const url = `http://127.0.0.1:${server.address().port}`;
  const account = { actor: id(1), household: id(10) };
  const client = mealClient(
    url,
    account,
    Effect.succeed({ access_token: remote.bearer, refresh_token: "fixture", user: { id: id(1) } }),
  );
  const f = await fixture(t);
  const session = await run(f.store.activate(account, id(200)));
  const first = new MealWeekRuntime(client, { store: f.store, session }, week);
  await first.load();
  assert.equal(first.getSnapshot().fresh, true);
  assert.equal(first.getSnapshot().snapshot.entries[0].title, "Legacy soup");
  const saved = first.getSnapshot().snapshot;
  first.dispose();
  const reopened = f.reopen();
  let online = false;
  const reconnecting = {
    read: (date) =>
      online ? client.read(date) : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
  };
  const restarted = new MealWeekRuntime(reconnecting, { store: reopened.store, session }, week);
  await restarted.load();
  assert.deepEqual(restarted.getSnapshot().snapshot, saved);
  assert.equal(restarted.getSnapshot().fresh, false);
  remote.db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner dinner' where id='${id(100)}'`,
  );
  online = true;
  await restarted.load();
  assert.equal(restarted.getSnapshot().snapshot.revision, "1");
  assert.equal(restarted.getSnapshot().snapshot.entries[0].title, "Partner dinner");
  assert.equal(restarted.getSnapshot().fresh, true);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await restarted.load();
  assert.equal(restarted.getSnapshot().snapshot, null);
  assert.equal(restarted.getSnapshot().access, "verify");
  remote.db.sql(
    `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First')`,
  );
  await restarted.load();
  assert.equal(restarted.getSnapshot().access, "ready");
  assert.equal(restarted.getSnapshot().snapshot.entries[0].title, "Partner dinner");
  restarted.dispose();
  const other = await run(reopened.store.activate({ actor: id(2), household: id(10) }, id(201)));
  assert.equal(await run(reopened.store.readMealWeek(other, week)), null);
});
