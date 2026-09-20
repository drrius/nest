import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { groceryClient } from "../../src/groceries/client.ts";
import { groceryEditor } from "../../src/groceries/editor-runtime.ts";
import { fixture as sqliteFixture, operation, lease, target } from "../offline-fixture.mjs";
const actor = "00000000-0000-4000-8000-000000000001",
  household = "00000000-0000-4000-8000-000000000010";
const files = [
  "tests/database/grocery-edit-fixture.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "tests/integration/grocery-postgrest.sql",
];
async function backend(t) {
  const remote = await postgrestFixture(t, files);
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
  const client = groceryClient(
    `http://127.0.0.1:${server.address().port}`,
    { actor, household },
    Effect.succeed({ access_token: remote.bearer, user: { id: actor } }),
  );
  return { remote, client };
}
function editor(account, client, transport) {
  const provide = (effect) => effect.pipe(Effect.provideService(FetchHttpClient.Fetch, transport));
  let view;
  const runtime = groceryEditor(
    account,
    {
      ...client,
      categories: () => provide(client.categories()),
      change: (input) => provide(client.change(input)),
    },
    (next) => {
      view = next;
    },
  );
  return { runtime, view: () => view };
}

test("real online grocery edits retry a lost creation receipt after SQLite restart, preserve partner conflicts and remove explicitly", async (t) => {
  const { remote, client } = await backend(t),
    local = await sqliteFixture(t);
  const session = await Effect.runPromise(local.store.activate({ actor, household }, lease));
  let lose = true;
  const attempts = [];
  const transport = lostResponseTransport(() => lose, attempts);
  const change = {
    action: "add",
    command: {
      operationId: operation,
      itemId: target,
      name: "Milk",
      quantity: "2",
      unit: "litres",
      categoryId: null,
    },
  };
  const first = editor({ store: local.store, session }, client, transport);
  await first.runtime.load();
  await first.runtime.save(change);
  assert.equal(first.view().saved, false);
  assert.deepEqual(first.view().pending, change);
  assert.equal(
    remote.db.sql(`select count(*) from public.grocery_items where id='${target}'`),
    "1",
  );
  first.runtime.dispose();
  const reopened = local.reopen();
  const next = await Effect.runPromise(reopened.store.activate({ actor, household }, operation));
  lose = false;
  const second = editor({ store: reopened.store, session: next }, client, transport);
  t.after(() => second.runtime.dispose());
  await second.runtime.load();
  assert.equal(attempts.length, 1);
  await second.runtime.retry();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(second.view().saved, true);
  remote.db.sql(`update public.grocery_items set name='Oat milk' where id='${target}'`);
  const edit = {
    action: "edit",
    command: { ...change.command, operationId: lease, expectedVersion: "1", name: "Almond milk" },
  };
  await second.runtime.save(edit);
  assert.match(second.view().error, /changed/);
  assert.equal(
    remote.db.sql(`select name from public.grocery_items where id='${target}'`),
    "Oat milk",
  );
  await second.runtime.discard();
  await second.runtime.save({
    ...edit,
    command: {
      ...edit.command,
      operationId: "50000000-0000-4000-8000-000000000008",
      expectedVersion: "2",
    },
  });
  assert.equal(second.view().saved, true);
  await second.runtime.save({
    action: "remove",
    command: {
      operationId: "50000000-0000-4000-8000-000000000009",
      itemId: target,
      expectedVersion: "3",
    },
  });
  assert.equal(second.view().saved, true);
  assert.equal(
    remote.db.sql(`select state from public.grocery_items where id='${target}'`),
    "removed",
  );
  assert.equal(await Effect.runPromise(reopened.store.readGroceryChange(next)), null);
});

function lostResponseTransport(lose, attempts) {
  return async (input, init) => {
    const request = new Request(input, init);
    const mutation = request.method === "POST";
    if (mutation) attempts.push(await request.clone().json());
    const response = await fetch(request);
    if (mutation && lose() && response.status === 200) {
      await response.arrayBuffer();
      throw new TypeError("Fixture lost committed creation response");
    }
    return response;
  };
}
