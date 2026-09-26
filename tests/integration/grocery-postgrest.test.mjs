import { groceryEpochFiles } from "./offline-epoch-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { groceryTools } from "../../apps/api/src/groceries/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("actual PostgREST grocery API/tools preserve bigint versions, retries and tenant boundaries", async (t) => {
  const fixture = await groceryFixture(t);
  const config = { url: fixture.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const headers = {
    authorization: `Bearer ${fixture.bearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  const call = (path, body) =>
    handler(
      new Request(`http://localhost/v1/groceries${path}`, {
        headers,
        method: body ? "POST" : "GET",
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const add = {
    operationId: id(100),
    itemId: id(101),
    name: "Milk",
    quantity: "2",
    unit: "litres",
    categoryId: id(30),
  };
  assert.deepEqual((await (await call("")).json()).groceries, []);
  const created = await call("/add", add);
  assert.equal(created.status, 200);
  const first = await created.json();
  assert.equal(first.receipt.version, "1");
  assert.deepEqual(await (await call("/add", add)).json(), first);
  assert.equal((await (await call("/categories")).json()).categories.length, 1);
  const rows = (await (await call("")).json()).groceries;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, "1");
  const checked = { operationId: id(102), itemId: add.itemId, expectedVersion: "1", checked: true };
  assert.equal((await call("/check", checked)).status, 200);
  assert.equal(
    (await call("/edit", { ...add, operationId: id(103), expectedVersion: "1", name: "Oat milk" }))
      .status,
    409,
  );
  assert.equal(
    (await call("/edit", { ...add, operationId: id(104), expectedVersion: "2", name: "Oat milk" }))
      .status,
    200,
  );
  await assertNonretryableConflict(fixture, add.itemId);
  // Set a high initial version in the fixture without the production version trigger.
  fixture.db.sql(`alter table public.grocery_items disable trigger nest_grocery_version;
    update public.grocery_items set native_version=9007199254740993 where id='${add.itemId}';
    alter table public.grocery_items enable trigger nest_grocery_version;`);
  assert.equal((await (await call("")).json()).groceries[0].version, "9007199254740993");
  const tools = groceryTools(new Request("http://localhost/v1/chat", { headers }), config);
  const options = { toolCallId: "remove", messages: [] };
  const removed = await tools.removeGrocery.execute(
    { operationId: id(105), itemId: add.itemId, expectedVersion: "9007199254740993" },
    options,
  );
  assert.equal(removed.ok, true);
  assert.equal(removed.value.version, "9007199254740994");
  assert.equal((await call("/check", { ...checked, operationId: id(106) })).status, 410);
  assert.deepEqual((await (await call("")).json()).groceries, []);
  const outsider = await handler(
    new Request("http://localhost/v1/groceries/add", {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${fixture.otherBearer}` },
      body: JSON.stringify(add),
    }),
  );
  assert.equal(outsider.status, 403);
  fixture.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await tools.addGrocery.execute(add, { ...options, toolCallId: "revoked" }), {
    ok: false,
    code: "forbidden",
  });
});

function groceryFixture(t) {
  return postgrestFixture(t, [
    "tests/database/grocery-edit-fixture.sql",
    "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
    "supabase/migrations/20260920002735_native_grocery_commands.sql",
    "tests/integration/grocery-postgrest.sql",
    "tests/database/grocery-meal-source-fixture.sql",
    "supabase/migrations/20260921090604_native_grocery_snapshot.sql",
    ...groceryEpochFiles,
    "supabase/migrations/20260926092224_native_grocery_nonretryable_conflicts.sql",
  ]);
}

async function assertNonretryableConflict(fixture, target) {
  const response = await fetch(`${fixture.url}/rest/v1/rpc/nest_edit_grocery`, {
    method: "POST",
    headers: { authorization: `Bearer ${fixture.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_operation: id(109),
      p_action: "edit",
      p_target: target,
      p_expected: "1",
      p_name: "Stale edit",
      p_quantity: null,
      p_unit: null,
      p_category: null,
    }),
  });
  assert.equal(response.status, 412);
  assert.equal((await response.json()).code, "PT412");
}
