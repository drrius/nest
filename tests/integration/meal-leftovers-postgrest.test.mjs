import { createRequire } from "node:module";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { MealLeftoversRuntime } from "../../apps/mobile/src/meals/leftovers-runtime.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeSelectionFiles, id, input, week } from "../database/recipe-selection-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect");
async function backend(t, rpc) {
  const remote = await postgrestFixture(t, [
    ...recipeSelectionFiles,
    "supabase/migrations/20260921020754_native_meal_leftovers.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(500)}','${id(10)}','Existing groceries')`,
  );
  const proxy = await lostResponseProxy(t, remote.url, `/rest/v1/rpc/${rpc}`);
  const server = nodeServer(
    createHandler({ url: proxy.url, publishableKey: "sb_publishable_fixture" }),
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
  const headers = (bearer = remote.bearer) => ({
    authorization: `Bearer ${bearer}`,
    "x-nest-household": id(10),
    "content-type": "application/json",
  });
  const write = (path, value, bearer) =>
    fetch(url + path, { method: "POST", headers: headers(bearer), body: JSON.stringify(value) });
  const read = (entryId, revision, bearer) =>
    fetch(
      url +
        "/v1/meals/planned-recipe?" +
        new URLSearchParams({ entryId, weekStart: week, revision }),
      { headers: headers(bearer) },
    );
  return { remote, proxy, url, headers, write, read };
}
test("HTTP leftovers replay after lost response, retain source ingredients and deny revoked recovery", async (t) => {
  const f = await backend(t, "nest_place_leftovers");
  const placed = await f.write("/v1/meals/recipe/place", { ...input(), operationId: id(800) });
  assert.equal(placed.status, 200);
  const source = (await placed.json()).receipt;
  const command = {
    operationId: "ABCDEF00-0000-4000-8000-000000000801",
    entryId: source.entryId.toUpperCase(),
    sourceWeekStart: week,
    targetWeekStart: week,
    expectedSourceRevision: "1",
    expectedTargetRevision: "1",
    date: "2030-01-08",
    slot: "dinner",
  };
  const first = await f.write("/v1/meals/leftovers", command);
  assert.equal(first.status, 503);
  assert.equal(f.proxy.dropped(), 1);
  const committed = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_leftover_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set name='Later library edit',archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  const retry = await f.write("/v1/meals/leftovers", command);
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, committed);
  const detail = await (await f.read(committed.entryId, "2")).json();
  assert.equal(detail.entry.leftoverSourceId, source.entryId);
  assert.equal(detail.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(
    (await f.write("/v1/meals/leftovers", { ...command, title: "Injected" })).status,
    400,
  );
  assert.equal(
    (await f.write("/v1/meals/leftovers", { ...command, operationId: id(802) })).status,
    409,
  );
  assert.equal((await f.write("/v1/meals/leftovers", command, f.remote.otherBearer)).status, 403);
  assert.equal((await fetch(f.url + "/v1/meals/leftovers")).status, 405);
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await f.write("/v1/meals/leftovers", command)).status, 403);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "1");
});

test("native leftovers cross weeks, retry lost acknowledgment and retain the original recipe", async (t) => {
  const f = await backend(t, "nest_place_leftovers");
  const client = mealClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({
      access_token: f.remote.bearer,
      refresh_token: "fixture",
      user: { id: id(1) },
    }),
  );
  const source = await Effect.runPromise(client.placeRecipe({ ...input(), operationId: id(850) }));
  const runtime = new MealLeftoversRuntime(
    client,
    { sourceWeekStart: week, entryId: source.entryId },
    () => id(851),
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  await runtime.selectWeek("2030-01-14");
  await runtime.save({ date: "2030-01-15", slot: "lunch" });
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(f.proxy.dropped(), 1);
  f.remote.db.sql(
    `update public.meal_definitions set archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  await runtime.retry();
  const saved = runtime.getSnapshot();
  assert.equal(saved.stage, "saved");
  assert.equal(saved.source.revision, "1");
  assert.equal(saved.destination.revision, "1");
  assert.equal(saved.receipt.sourceEntryId, source.entryId);
  const detail = await Effect.runPromise(
    client.plannedRecipe({
      weekStart: "2030-01-14",
      revision: "1",
      entryId: saved.receipt.entryId,
    }),
  );
  assert.equal(detail.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.equal(detail.entry.leftoverSourceId, source.entryId);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().source, null);
  assert.equal(runtime.getSnapshot().receipt, null);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "1");
});
