import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as contentFixture, id } from "../database/daily-summary-content-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { notificationClient } from "../../apps/mobile/src/notifications/client.ts";
import { dailySummaryTool } from "../../apps/api/src/notifications/summary-tool.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(Fetch.layer)));
async function fixture(t) {
  const f = contentFixture(t);
  for (const file of [
    "20260923014222_native_daily_summary_schedule.sql",
    "20260923015620_native_daily_summary_snapshot.sql",
    "20260923015956_native_daily_summary_read.sql",
  ])
    f.db.file(`supabase/migrations/${file}`);
  f.db.sql("update public.nest_notification_preferences set daily_summary_time='00:00'");
  const summaryId = f.db.sql(
    `select private.nest_schedule_daily_summary('${id(10)}','${id(1)}',(clock_timestamp() at time zone 'Europe/Zurich')::date)`,
  );
  const expected = JSON.parse(f.db.sql(`select private.nest_start_daily_summary('${summaryId}')`));
  const upstream = await postgrestFixture(t, ["tests/integration/food-postgrest.sql"], f.db);
  const config = { url: upstream.url, publishableKey: "sb_publishable_fixture" };
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
  const client = (actor = 1, bearer = upstream.bearer) =>
    notificationClient(
      url,
      { actor: id(actor), household: id(10) },
      Effect.succeed({ user: { id: id(actor) }, access_token: bearer }),
    );
  return { ...f, ...upstream, config, url, summaryId, expected, client };
}
test("native and SDK summary reads share real recipient-only authorization", async (t) => {
  const f = await fixture(t);
  const input = { summaryId: f.summaryId };
  assert.deepEqual(await run(f.client().summary(input)), f.expected);
  const tool = dailySummaryTool(
    new Request("http://localhost", { headers: { authorization: `Bearer ${f.bearer}` } }),
    f.config,
  );
  assert.deepEqual(await tool.execute(input, { toolCallId: "summary", messages: [] }), {
    ok: true,
    value: f.expected,
  });
  await assert.rejects(run(f.client(2, f.partnerBearer).summary(input)));
  await assert.rejects(run(f.client(3, f.otherBearer).summary(input)));
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  assert.deepEqual(await run(f.client().summary(input)), f.expected);
  const response = await fetch(
    `${f.url}/v1/daily-summary?summaryId=${f.summaryId}&householdId=${id(10)}`,
    { headers: { authorization: `Bearer ${f.bearer}` } },
  );
  assert.equal(response.status, 400);
  assert.equal((await fetch(`${f.url}/v1/daily-summary?summaryId=${f.summaryId}`)).status, 401);
  const direct = await fetch(`${f.config.url}/rest/v1/rpc/nest_read_daily_summary`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.partnerBearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), p_summary: f.summaryId }),
  });
  assert.notEqual(direct.status, 200);
});
