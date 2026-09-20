import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealRemovalFiles } from "../database/meal-removal-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = {
  operationId: id(201),
  sourceWeekStart: "2026-09-21",
  targetWeekStart: "2026-09-28",
  expectedSourceRevision: "1",
  expectedTargetRevision: "0",
  date: "2026-09-29",
  slot: "dinner",
  entryId: id(100),
};
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "supabase/migrations/20260920214557_native_meal_move_command.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(100)}','${id(10)}','2026-09-22','lunch','Pasta')`,
  );
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_move_meal")
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
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = (bearer = remote.bearer) => {
    const headers = {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      "x-nest-household": id(10),
    };
    return {
      read: (week = command.sourceWeekStart) =>
        fetch(`${url}/v1/meals/week?weekStart=${week}`, { headers }),
      move: (input = command) =>
        fetch(`${url}/v1/meals/move`, { method: "POST", headers, body: JSON.stringify(input) }),
    };
  };
  return { remote, proxy, url, connect };
}

test("move HTTP recovers an unchanged receipt after lost response and a later partner move", async (t) => {
  const { remote, proxy, connect } = await backend(t, true),
    owner = connect();
  assert.equal((await owner.move()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const saved = JSON.parse(remote.db.sql("select result from public.nest_meal_move_receipts"));
  assert.equal(saved.sourceRevision, "2");
  assert.equal(saved.targetRevision, "1");
  const later = {
    ...command,
    operationId: id(202),
    sourceWeekStart: command.targetWeekStart,
    expectedSourceRevision: "1",
    targetWeekStart: "2026-10-05",
    expectedTargetRevision: "0",
    date: "2026-10-06",
  };
  assert.equal((await connect(remote.partnerBearer).move(later)).status, 200);
  const retry = await owner.move();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, saved);
  assert.deepEqual((await (await owner.read()).json()).entries, []);
  assert.deepEqual((await (await owner.read(command.targetWeekStart)).json()).entries, []);
  assert.equal(
    (await (await owner.read(later.targetWeekStart)).json()).entries[0].entryId,
    command.entryId,
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_meal_move_receipts"), "2");
  assert.equal((await owner.move({ ...command, slot: "lunch" })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await owner.move()).status, 403);
});
test("HTTP same-week move advances once; stale, occupied, foreign and malformed writes fail", async (t) => {
  const { remote, url, connect } = await backend(t),
    owner = connect();
  const same = {
    ...command,
    targetWeekStart: command.sourceWeekStart,
    expectedTargetRevision: "1",
    date: "2026-09-23",
  };
  const result = await owner.move(same);
  assert.equal(result.status, 200);
  const saved = (await result.json()).receipt;
  assert.equal(saved.sourceRevision, "2");
  assert.equal(saved.targetRevision, "2");
  assert.equal((await owner.move({ ...command, operationId: id(203) })).status, 409);
  remote.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','2026-09-29','dinner','Occupied')`,
  );
  assert.equal(
    (
      await owner.move({
        ...command,
        operationId: id(204),
        expectedSourceRevision: "2",
        expectedTargetRevision: "1",
      })
    ).status,
    409,
  );
  assert.equal((await connect(remote.otherBearer).move(command)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/move`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/move`)).status, 405);
  assert.equal((await fetch(`${url}/v1/meals/unknown`, { method: "POST" })).status, 404);
  for (const patch of [
    { actorId: id(2) },
    { date: "2026-09-27" },
    { targetWeekStart: "2026-09-21" },
  ])
    assert.equal((await owner.move({ ...command, ...patch })).status, 400);
  assert.equal(remote.db.sql("select count(*) from public.nest_meal_move_receipts"), "1");
});
