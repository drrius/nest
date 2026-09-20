import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { groceryClient } from "../../src/groceries/client.ts";
import { groceryFlow } from "../../src/groceries/flow.ts";
import { fixture as sqliteFixture, operation, lease, target } from "../offline-fixture.mjs";
const actor = "00000000-0000-4000-8000-000000000001",
  partner = "00000000-0000-4000-8000-000000000002";
const household = "00000000-0000-4000-8000-000000000010";
const files = [
  "tests/database/grocery-edit-fixture.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "tests/integration/grocery-postgrest.sql",
];
async function start(t, handler) {
  const server = nodeServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("native grocery clients converge across lost receipts and restarted SQLite without losing conflicts", async (t) => {
  const remote = await postgrestFixture(t, files),
    local = await sqliteFixture(t);
  remote.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${target}','${household}','Milk')`,
  );
  const base = await start(
    t,
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  const client = groceryClient(
    base,
    { actor, household },
    Effect.succeed({ access_token: remote.bearer, user: { id: actor } }),
  );
  const other = groceryClient(
    base,
    { actor: partner, household },
    Effect.succeed({ access_token: remote.partnerBearer, user: { id: partner } }),
  );
  let lose = true;
  const requests = [];
  const transport = async (input, init) => {
    const request = new Request(input, init),
      mutation = new URL(request.url).pathname.endsWith("/check");
    if (mutation) requests.push(await request.clone().json());
    const response = await fetch(request);
    if (mutation && lose && response.status === 200) {
      await response.arrayBuffer();
      throw new TypeError("Fixture lost acknowledgment");
    }
    return response;
  };
  const run = (effect) =>
    Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, transport)));
  const session = await run(local.store.activate({ actor, household }, lease));
  let flow = groceryFlow({ store: local.store, session }, client);
  await run(flow.sync);
  const original = (await run(flow.read)).groceries[0];
  await run(flow.check(original, true, operation));
  await assert.rejects(run(flow.sync), { code: "unavailable" });
  assert.equal(
    remote.db.sql(`select native_version from public.grocery_items where id='${target}'`),
    "2",
  );
  const reopened = local.reopen();
  const next = await run(reopened.store.activate({ actor, household }, operation));
  flow = groceryFlow({ store: reopened.store, session: next }, client);
  lose = false;
  await run(flow.sync);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal((await run(flow.read)).pending.length, 0);
  const partnerReceipt = await run(
    other.check({ operationId: lease, itemId: target, expectedVersion: "1", checked: true }),
  );
  assert.equal(partnerReceipt.outcome, "already_applied");
  assert.equal(partnerReceipt.version, "2");
  const checked = (await run(flow.read)).groceries[0];
  await run(flow.check(checked, false, "50000000-0000-4000-8000-000000000004"));
  // A real concurrent description edit makes the offline opposite intent stale.
  remote.db.sql(`update public.grocery_items set name='Oat milk' where id='${target}'`);
  await run(flow.sync);
  const conflicted = await run(flow.read);
  assert.equal(conflicted.pending[0].reason, "changed");
  assert.equal(conflicted.groceries[0].checked, true);
  await run(flow.discard(conflicted.pending[0].operation));
  const current = (await run(flow.read)).groceries[0];
  await run(flow.check(current, false, "50000000-0000-4000-8000-000000000005"));
  remote.db.sql(`delete from public.household_members where user_id='${actor}'`);
  await assert.rejects(run(flow.sync), { code: "forbidden" });
  assert.equal((await run(flow.read)).pending.length, 1);
  assert.equal(
    remote.db.sql(`select native_version from public.grocery_items where id='${target}'`),
    "3",
  );
});

test("partner edit/check convergence leaves a stale opposite toggle conflicted", async (t) => {
  const remote = await postgrestFixture(t, files),
    local = await sqliteFixture(t);
  remote.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${target}','${household}','Milk')`,
  );
  const base = await start(
    t,
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  const client = groceryClient(
    base,
    { actor, household },
    Effect.succeed({ access_token: remote.bearer, user: { id: actor } }),
  );
  const other = groceryClient(
    base,
    { actor: partner, household },
    Effect.succeed({ access_token: remote.partnerBearer, user: { id: partner } }),
  );
  const run = Effect.runPromise;
  const session = await run(local.store.activate({ actor, household }, lease));
  const flow = groceryFlow({ store: local.store, session }, client);
  await run(flow.sync);
  const original = (await run(flow.read)).groceries[0];
  await run(flow.check(original, true, operation));
  await run(flow.check(original, false, "50000000-0000-4000-8000-000000000004"));
  remote.db.sql(`update public.grocery_items set name='Oat milk' where id='${target}'`);
  await run(
    other.check({ operationId: lease, itemId: target, expectedVersion: "2", checked: true }),
  );
  await run(flow.sync);
  const result = await run(flow.read);
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].reason, "changed");
  assert.equal(result.groceries[0].checked, true);
  assert.equal(result.groceries[0].version, "3");
  assert.equal(
    remote.db.sql(`select native_version from public.grocery_items where id='${target}'`),
    "3",
  );
});

test("native category labels survive SQLite restart and archived categories fall back without hiding groceries", async (t) => {
  const remote = await postgrestFixture(t, files),
    local = await sqliteFixture(t);
  const category = "00000000-0000-4000-8000-000000000030";
  remote.db.sql(
    `insert into public.grocery_items(id,household_id,name,category_id) values('${target}','${household}','Apples','${category}')`,
  );
  const base = await start(
    t,
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  const client = groceryClient(
    base,
    { actor, household },
    Effect.succeed({ access_token: remote.bearer, user: { id: actor } }),
  );
  const run = Effect.runPromise;
  const session = await run(local.store.activate({ actor, household }, lease));
  await run(groceryFlow({ store: local.store, session }, client).sync);
  const cached = (await run(local.store.readGroceries(session))).groceries.find(
    (row) => row.itemId === target,
  );
  assert.equal(cached.categoryName, "Produce");
  const restarted = local.reopen(),
    resumed = await run(restarted.store.activate({ actor, household }, operation));
  assert.equal(
    (await run(restarted.store.readGroceries(resumed))).groceries.find(
      (row) => row.itemId === target,
    ).categoryName,
    "Produce",
  );
  remote.db.sql(`update public.grocery_categories set archived_at=now() where id='${category}'`);
  await run(groceryFlow({ store: restarted.store, session: resumed }, client).sync);
  const current = (await run(restarted.store.readGroceries(resumed))).groceries.find(
    (row) => row.itemId === target,
  );
  assert.equal(current.categoryId, category);
  assert.equal(current.categoryName, null);
  assert.equal(current.name, "Apples");
  const other = await run(restarted.store.activate({ actor: partner, household }, lease));
  assert.equal((await run(restarted.store.readGroceries(other))).loaded, false);
});
