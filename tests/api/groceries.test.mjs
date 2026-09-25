import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { groceryTools } from "../../apps/api/src/groceries/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  home = id(10),
  itemId = id(100),
  operationId = id(101);
const add = { operationId, itemId, name: "Milk", quantity: null, unit: null, categoryId: null };
const check = { operationId, itemId, expectedVersion: "9007199254740993", checked: true };
const item = {
  itemId,
  householdId: home,
  name: "Milk",
  quantity: null,
  unit: null,
  categoryId: null,
  version: "9007199254740993",
  checked: false,
  legacyState: "active",
  category: null,
  mealSource: null,
};
const calls = [];
let mode = "ok",
  rows = [item],
  total = 1,
  revoked = false,
  config,
  handler;
function rpc(response, body) {
  const errors = {
    removed: [404, "P0002"],
    conflict: [500, "40001"],
    invalid: [400, "22023"],
    forbidden: [403, "42501"],
    expired: [401, "PGRST301"],
    outage: [503, "secret"],
  };
  if (mode === "redirect") return response.writeHead(302, { location: "/sink" }).end();
  if (errors[mode])
    return response
      .writeHead(errors[mode][0])
      .end(JSON.stringify({ code: errors[mode][1], message: "private detail" }));
  response.end(JSON.stringify(commandReceipt(body)));
}
function commandReceipt(body) {
  const receipt = {
    operation: body.p_command?.operationId ?? body.p_operation,
    target: body.p_command?.itemId ?? body.p_target,
    version: "9007199254740994",
    checked: body.p_command?.checked ?? false,
    ...(body.p_action ? { removed: body.p_action === "remove" } : { outcome: "applied" }),
  };
  return malformedReceipt(receipt);
}
function malformedReceipt(receipt) {
  if (mode === "wrong-target") receipt.target = id(999);
  if (mode === "wrong-checked") receipt.checked = !receipt.checked;
  if (mode === "wrong-removed") receipt.removed = !receipt.removed;
  if (mode === "numeric-version") receipt.version = 1;
  return receipt;
}
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  calls.push({ url: request.url, headers: request.headers, body });
  response.setHeader("content-type", "application/json");
  if (request.url === "/auth/v1/user") return response.end(JSON.stringify({ id: actor }));
  if (request.url.startsWith("/rest/v1/household_members"))
    return response.end(
      JSON.stringify(
        revoked ? [] : [{ user_id: actor, household_id: home, display_name: "Member" }],
      ),
    );
  if (request.url === "/rest/v1/rpc/nest_grocery_epoch_snapshot") {
    return response.end(
      JSON.stringify({ version: 1, householdId: home, offlineEpoch: id(800), total, items: rows }),
    );
  }
  if (request.url.startsWith("/rest/v1/grocery_categories")) {
    response.setHeader("content-range", "0-0/1");
    return response.end(
      JSON.stringify([{ categoryId: id(30), householdId: home, name: "Produce" }]),
    );
  }
  return rpc(response, body);
});
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  config = {
    url: `http://127.0.0.1:${server.address().port}`,
    publishableKey: "sb_publishable_fixture",
  };
  handler = createHandler(config);
});
after(() => new Promise((resolve) => server.close(resolve)));
function call(path = "", body, headers = {}) {
  return handler(
    new Request(`http://localhost/v1/groceries${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: "Bearer member", "content-type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
const rpcCount = () => calls.filter((call) => call.url.includes("/rpc/")).length;

test("grocery snapshots bind verified household and retain bigint strings and legacy claim state", async () => {
  rows = [{ ...item, legacyState: "claimed" }];
  const response = await call();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).groceries, [
    {
      itemId,
      name: "Milk",
      quantity: null,
      unit: null,
      categoryId: null,
      version: item.version,
      checked: false,
      legacyClaimed: true,
      offlineEpoch: id(800),
      categoryName: null,
      mealSource: null,
    },
  ]);
  assert.equal(calls.at(-1).url, "/rest/v1/rpc/nest_grocery_epoch_snapshot");
  assert.deepEqual(calls.at(-1).body, { p_household: home });
  assert.equal((await call("/categories")).status, 200);
  rows = [item];
});

test("mismatched snapshot totals, duplicate and cross-household rows never become complete snapshots", async () => {
  for (const candidate of [undefined, "1", 2, -1]) {
    total = candidate;
    assert.equal((await call()).status, 503);
  }
  total = 2;
  rows = [item, item];
  assert.equal((await call()).status, 503);
  total = 1;
  for (const candidate of [
    { ...item, householdId: id(20) },
    { ...item, version: Number(item.version) },
    { ...item, version: "9223372036854775808" },
    { ...item, legacyState: "purchased" },
  ]) {
    rows = [candidate];
    assert.equal((await call()).status, 503);
  }
  rows = [];
  total = 0;
  assert.deepEqual((await (await call()).json()).groceries, []);
  rows = [item];
  total = 1;
});

test("commands preserve exact retry identity and versions and cannot choose actor or household", async () => {
  const response = await call("/check", check);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.at(-1).body, {
    p_household: home,
    p_epoch: null,
    p_command: check,
  });
  const before = rpcCount();
  for (const input of [
    { ...check, actor: id(2) },
    { ...check, householdId: id(20) },
    { ...check, expectedVersion: 1 },
    { ...check, expectedVersion: "01" },
    { ...check, expectedVersion: "9223372036854775808" },
    { ...check, checked: "true" },
  ])
    assert.equal((await call("/check", input)).status, 400);
  assert.equal(rpcCount(), before);
});

test("online add/edit/remove validation rejects hidden fields and missing versions before RPC", async () => {
  const before = rpcCount();
  for (const [path, input] of [
    ["/add", { ...add, name: " " }],
    ["/add", { ...add, expectedVersion: "1" }],
    ["/add", { ...add, name: "x".repeat(121) }],
    ["/add", { ...add, unit: "x".repeat(81) }],
    ["/edit", add],
    ["/remove", { ...add, expectedVersion: "1" }],
  ])
    assert.equal((await call(path, input)).status, 400);
  assert.equal(rpcCount(), before);
  assert.equal((await call("/add", add)).status, 200);
  assert.equal((await call("/edit", { ...add, expectedVersion: "1" })).status, 200);
  assert.equal((await call("/remove", { operationId, itemId, expectedVersion: "1" })).status, 200);
});

test("failed RPCs expose only distinct safe recovery codes without automatic retries", async () => {
  for (const [candidate, status, code] of [
    ["removed", 410, "removed"],
    ["conflict", 409, "conflict"],
    ["invalid", 400, "invalid_request"],
    ["forbidden", 403, "forbidden"],
    ["expired", 401, "unauthenticated"],
    ["outage", 503, "unavailable"],
  ]) {
    mode = candidate;
    const before = rpcCount();
    const response = await call("/check", check);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
    assert.equal(rpcCount(), before + 1);
  }
  mode = "ok";
});

test("mismatched receipt identity, intended state and numeric versions fail closed", async () => {
  for (const candidate of ["wrong-target", "wrong-checked", "numeric-version", "redirect"]) {
    mode = candidate;
    assert.equal((await call("/check", check)).status, 503);
  }
  mode = "wrong-removed";
  assert.equal((await call("/add", add)).status, 503);
  assert.equal(
    calls.some((call) => call.url === "/sink"),
    false,
  );
  mode = "ok";
});

test("AI actions share validation and reauthorize every invocation including retained tools", async () => {
  const tools = groceryTools(
    new Request("http://localhost/v1/chat", { headers: { authorization: "Bearer member" } }),
    config,
  );
  const options = { toolCallId: "test", messages: [] };
  for (const [name, input] of [
    ["listGroceries", {}],
    ["listGroceryCategories", {}],
    ["addGrocery", add],
    ["editGrocery", { ...add, expectedVersion: "1" }],
    ["removeGrocery", { operationId, itemId, expectedVersion: "1" }],
    ["checkGrocery", check],
  ])
    assert.equal((await tools[name].execute(input, options)).ok, true);
  const before = rpcCount();
  assert.deepEqual(await tools.addGrocery.execute({ ...add, actor: id(2) }, options), {
    ok: false,
    code: "forbidden",
  });
  revoked = true;
  assert.deepEqual(await tools.checkGrocery.execute(check, options), {
    ok: false,
    code: "forbidden",
  });
  assert.equal((await call()).status, 403);
  assert.equal(rpcCount(), before);
  revoked = false;
});

test("a stale household expectation blocks grocery reads, writes and AI tools", async () => {
  const headers = { authorization: "Bearer member", "x-nest-household": id(20) };
  const before = calls.length;
  assert.equal((await call("", undefined, headers)).status, 403);
  assert.equal((await call("/add", add, headers)).status, 403);
  const tools = groceryTools(new Request("http://localhost/v1/chat", { headers }), config);
  assert.deepEqual(await tools.listGroceries.execute({}, { toolCallId: "stale", messages: [] }), {
    ok: false,
    code: "forbidden",
  });
  assert.ok(
    calls
      .slice(before)
      .every(
        (call) =>
          call.url.startsWith("/auth/") || call.url.startsWith("/rest/v1/household_members"),
      ),
  );
});

test("grocery categories are joined into the same authorized snapshot and cannot expose a foreign label", async () => {
  const category = { categoryId: id(30), householdId: home, name: "Produce", archivedAt: null };
  rows = [{ ...item, categoryId: id(30), category }];
  let response = await call();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).groceries[0].categoryName, "Produce");
  assert.equal(calls.at(-1).url, "/rest/v1/rpc/nest_grocery_epoch_snapshot");
  for (const patch of [{ householdId: id(20) }, { categoryId: id(31) }, { name: "" }]) {
    rows = [{ ...item, categoryId: id(30), category: { ...category, ...patch } }];
    assert.equal((await call()).status, 503);
  }
  for (const value of [null, { ...category, archivedAt: "2026-09-20T00:00:00Z" }]) {
    rows = [{ ...item, categoryId: id(30), category: value }];
    response = await call();
    assert.equal(response.status, 200);
    const result = (await response.json()).groceries[0];
    assert.equal(result.categoryId, id(30));
    assert.equal(result.categoryName, null);
  }
  rows = [item];
});

test("grocery meal provenance is household bound and exposes only the retained display fields", async () => {
  const mealSource = {
    entryId: id(700),
    householdId: home,
    title: "Soup",
    date: "2030-01-07",
    slot: "dinner",
  };
  rows = [{ ...item, mealSource }];
  const response = await call();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).groceries[0].mealSource, {
    entryId: id(700),
    title: "Soup",
    date: "2030-01-07",
    slot: "dinner",
  });
  for (const patch of [
    { householdId: id(20) },
    { date: "2030-02-31" },
    { entryId: "bad" },
    { privateNotes: "Hidden" },
  ]) {
    rows = [{ ...item, mealSource: { ...mealSource, ...patch } }];
    assert.equal((await call()).status, 503);
  }
  rows = [item];
});
