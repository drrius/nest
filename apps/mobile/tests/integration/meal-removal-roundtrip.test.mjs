import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { mealClient } from "../../src/meals/client.ts";
import { MealRemovalRuntime } from "../../src/meals/removal-runtime.ts";
import { MealWeekRuntime } from "../../src/meals/runtime.ts";
import { fixture, run } from "../offline-fixture.mjs";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { mealRemovalFiles } from "../../../../tests/database/meal-removal-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { weekStart: "2026-09-21", entryId: id(100) };
async function backend(t, lossy = false) {
  const remote = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(100)}','${id(10)}','2026-09-22','lunch','Pasta')`,
  );
  const proxy = lossy
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_remove_meal")
    : null;
  const server = nodeServer(
    createHandler({ url: proxy?.url ?? remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const account = { actor: id(1), household: id(10) };
  const client = mealClient(
    `http://127.0.0.1:${server.address().port}`,
    account,
    Effect.succeed({ access_token: remote.bearer, refresh_token: "fixture", user: { id: id(1) } }),
  );
  const runtime = new MealRemovalRuntime(client, target, () => id(200));
  t.after(() => runtime.dispose());
  return { remote, proxy, client, account, runtime };
}

test("native removal retries lost acknowledgment after partner restoration and refreshes the actual SQLite week", async (t) => {
  const f = await backend(t, true);
  await f.runtime.load();
  await f.runtime.save();
  assert.equal(f.runtime.getSnapshot().stage, "uncertain");
  assert.equal(f.proxy.dropped(), 1);
  const saved = JSON.parse(f.remote.db.sql("select result from public.nest_meal_removal_receipts"));
  f.remote.db.sql(
    `update public.meal_plan_entries set removed_at=null where id='${saved.entryId}'`,
  );
  await f.runtime.save();
  await f.runtime.retry();
  assert.equal(f.runtime.getSnapshot().stage, "saved");
  assert.deepEqual(f.runtime.getSnapshot().receipt, saved);
  assert.equal(f.runtime.getSnapshot().snapshot.revision, "3");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_removal_receipts"), "1");
  const local = await fixture(t),
    session = await run(local.store.activate(f.account, id(210)));
  const viewer = new MealWeekRuntime(f.client, { store: local.store, session }, target.weekStart);
  t.after(() => viewer.dispose());
  await viewer.load();
  assert.equal(viewer.getSnapshot().fresh, true);
  assert.equal(
    viewer.getSnapshot().snapshot.entries.some((entry) => entry.entryId === saved.entryId),
    true,
  );
  assert.deepEqual(
    await run(local.store.readMealWeek(session, target.weekStart)),
    f.runtime.getSnapshot().snapshot,
  );
  assert.deepEqual((await run(local.store.read(session))).pending, []);
});

test("native removal conflicts on partner edits and hides data after revoked reads", async (t) => {
  const f = await backend(t);
  await f.runtime.load();
  f.remote.db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner changed meal' where id='${id(100)}'`,
  );
  await f.runtime.save();
  assert.equal(f.runtime.getSnapshot().stage, "reload");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_removal_receipts"), "0");
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().snapshot.entries[0].title, "Partner changed meal");
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await f.runtime.save();
  assert.equal(f.runtime.getSnapshot().stage, "verify");
  assert.equal(f.runtime.getSnapshot().snapshot, null);
});
