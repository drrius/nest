import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { readMealWeekTool } from "../../apps/api/src/meals/tools.ts";
import { mealWeekFiles } from "../database/meal-week-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...mealWeekFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const config = { url: remote.url, publishableKey: "sb_publishable_fixture" };
  const server = nodeServer(createHandler(config));
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
  });
  const read = (query = "weekStart=2026-09-21", bearer = remote.bearer) =>
    fetch(`${url}/v1/meals/week?${query}`, { headers: headers(bearer) });
  const tool = (bearer = remote.bearer) =>
    readMealWeekTool(new Request(`${url}/v1/assistant/turn`, { headers: headers(bearer) }), config);
  return { remote, url, read, tool };
}

test("real authorized HTTP and private assistant reads share the exact saved week and revision", async (t) => {
  const { remote, read, tool } = await backend(t);
  const response = await read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const snapshot = await response.json();
  assert.equal(snapshot.revision, "0");
  assert.equal(snapshot.entries[0].title, "Legacy soup");
  const input = { weekStart: "2026-09-21" },
    options = { toolCallId: "read-week", messages: [] };
  assert.deepEqual(await tool().execute(input, options), { ok: true, value: snapshot });
  assert.deepEqual(
    await (await read("weekStart=2026-09-21", remote.partnerBearer)).json(),
    snapshot,
  );
  remote.db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner edited' where id='${id(100)}'`,
  );
  const updated = await (await read()).json();
  assert.equal(updated.revision, "1");
  assert.equal(updated.entries[0].title, "Partner edited");
  assert.deepEqual(await tool(remote.partnerBearer).execute(input, options), {
    ok: true,
    value: updated,
  });
  assert.equal(remote.db.sql("select count(*) from public.meal_plan_entries"), "3");
});

test("HTTP and assistant deny foreign/revoked access; invalid requests never look like empty weeks", async (t) => {
  const { remote, url, read, tool } = await backend(t);
  assert.equal((await read("weekStart=2026-09-21", remote.otherBearer)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/week?weekStart=2026-09-21`)).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/week`, { method: "POST" })).status, 405);
  for (const query of [
    "",
    "weekStart=2026-09-22",
    "weekStart=2026-09-21&householdId=foreign",
    "weekStart=2026-09-21&weekStart=2026-09-28",
  ]) {
    assert.equal((await read(query)).status, 400);
  }
  const input = { weekStart: "2026-09-21" },
    options = { toolCallId: "read-week", messages: [] };
  assert.deepEqual(await tool(remote.otherBearer).execute(input, options), {
    ok: false,
    code: "forbidden",
  });
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await read()).status, 403);
  assert.deepEqual(await tool().execute(input, options), { ok: false, code: "forbidden" });
});
