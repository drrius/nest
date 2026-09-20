import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { groceryClient } from "../src/groceries/client.ts";
import { account, target, operation } from "./offline-fixture.mjs";
const client = groceryClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ access_token: "fixture", user: { id: account.actor } }),
);
const command = {
  operationId: operation,
  itemId: target,
  name: "Milk",
  quantity: "2",
  unit: "litres",
  categoryId: null,
};
const receipt = { operation, target, version: "9007199254740994", checked: true, removed: false };
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("online add/edit/remove carry exact command identity and verify the matching receipt", async () => {
  for (const change of [
    { action: "add", command },
    { action: "edit", command: { ...command, expectedVersion: "9007199254740993" } },
    {
      action: "remove",
      command: { operationId: operation, itemId: target, expectedVersion: "9007199254740993" },
    },
  ]) {
    const result = await run(client.change(change), async (url, options) => {
      assert.equal(new URL(url).pathname, `/v1/groceries/${change.action}`);
      assert.equal(options.headers.authorization, "Bearer fixture");
      assert.equal(options.headers["x-nest-household"], account.household);
      assert.deepEqual(JSON.parse(new TextDecoder().decode(options.body)), change.command);
      return Response.json({
        version: 1,
        householdId: account.household,
        receipt: { ...receipt, removed: change.action === "remove" },
      });
    });
    assert.equal(result.version, "9007199254740994");
  }
});

test("mismatched edit receipts cannot clear a retained attempt", async () => {
  const envelope = { version: 1, householdId: account.household, receipt };
  for (const body of [
    { ...envelope, householdId: account.actor },
    { ...envelope, receipt: { ...receipt, operation: target } },
    { ...envelope, receipt: { ...receipt, target: operation } },
    { ...envelope, receipt: { ...receipt, removed: true } },
    { ...envelope, receipt: { ...receipt, version: 3 } },
  ])
    await assert.rejects(
      run(client.change({ action: "add", command }), async () => Response.json(body)),
      { code: "unavailable" },
    );
});

test("invalid edits never dispatch and HTTP failures remain actionable", async () => {
  let calls = 0;
  await assert.rejects(
    run(client.change({ action: "add", command: { ...command, name: " " } }), async () => {
      calls++;
      return Response.json({});
    }),
    { code: "invalid" },
  );
  assert.equal(calls, 0);
  for (const [status, code] of [
    [400, "invalid"],
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [410, "removed"],
    [503, "unavailable"],
  ])
    await assert.rejects(
      run(client.change({ action: "add", command }), async () => new Response(null, { status })),
      { code },
    );
});

test("category snapshots reject mixed households, duplicates and truncated bounds", async () => {
  const row = { categoryId: target, name: "Produce" };
  const envelope = { version: 1, householdId: account.household, categories: [row] };
  assert.deepEqual(await run(client.categories(), async () => Response.json(envelope)), [row]);
  for (const body of [
    { ...envelope, householdId: account.actor },
    { ...envelope, categories: [row, row] },
    { ...envelope, categories: Array(101).fill(row) },
    { ...envelope, categories: [{ ...row, categoryId: "invalid" }] },
  ])
    await assert.rejects(
      run(client.categories(), async () => Response.json(body)),
      { code: "unavailable" },
    );
});
