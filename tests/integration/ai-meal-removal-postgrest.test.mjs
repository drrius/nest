import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiMealRemovalFiles } from "../database/ai-meal-removal-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const value = {
  weekStart: "2026-10-05",
  expectedRevision: "1",
  entryId: "ABCDEF00-0000-4000-8000-000000000100",
};
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function setup(t) {
  const remote = await postgrestFixture(t, [
    ...aiMealRemovalFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${value.entryId}','${id(10)}','2026-10-06','lunch','Pasta')`,
  );
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Remove Tuesday lunch",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`);
  const connect = (lossy = false, bearer = remote.bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } }),
      { url: lossy ? proxy.url : remote.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn },
    ).tools;
  return { remote, proxy, turn, connect };
}

test("SDK removal recovers a committed lost response without removing a partner-restored meal", async (t) => {
  const f = await setup(t),
    tools = f.connect(true);
  const read = await tools.readMealWeek.execute({ weekStart: value.weekStart }, options("read"));
  assert.equal(read.ok, true);
  assert.equal(read.value.revision, "1");
  assert.deepEqual(await tools.removeMeal.execute(value, options("place")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.removeMeal.execute(value, options("reremoval")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_removal_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_plan_entries set removed_at=null where id='${receipt.entryId}'`,
  );
  const retry = await f.connect(true).removeMeal.execute(value, options("place"));
  assert.deepEqual(retry, { ok: true, value: receipt });
  const fresh = await f
    .connect()
    .readMealWeek.execute({ weekStart: value.weekStart }, options("fresh"));
  assert.equal(fresh.value.revision, "3");
  assert.equal(fresh.value.entries[0].entryId, value.entryId.toLowerCase());
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_removal_receipts"), "1");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.deepEqual(
    await f.connect(false, f.remote.partnerBearer).removeMeal.execute(value, options("place")),
    { ok: false, code: "forbidden" },
  );
});

test("SDK input identities are rejected and stale week conflicts cannot be silently retried as writes", async (t) => {
  const f = await setup(t);
  for (const patch of [{ actorId: id(2) }, { operationId: id(999) }, { householdId: id(20) }])
    assert.deepEqual(
      await f.connect().removeMeal.execute({ ...value, ...patch }, options("invalid")),
      { ok: false, code: "unavailable" },
    );
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "0");
  f.remote.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','2026-10-07','dinner','Partner meal')`,
  );
  assert.deepEqual(await f.connect().removeMeal.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  f.remote.db.sql("delete from public.meal_plan_entries where date='2026-10-07'");
  assert.deepEqual(await f.connect().removeMeal.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_removal_receipts"), "0");
});
