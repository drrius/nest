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
  weekStart: "2026-09-21",
  expectedRevision: "1",
  entryId: id(100),
};
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(100)}','${id(10)}','2026-09-22','lunch','Pasta')`,
  );
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_remove_meal")
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
      read: () => fetch(`${url}/v1/meals/week?weekStart=2026-09-21`, { headers }),
      remove: (input = command) =>
        fetch(`${url}/v1/meals/remove`, { method: "POST", headers, body: JSON.stringify(input) }),
    };
  };
  return { remote, proxy, url, connect };
}

test("removal HTTP retries its original receipt after partner restoration and rejects revoked recovery", async (t) => {
  const { remote, proxy, url, connect } = await backend(t, true);
  const owner = connect();
  assert.equal((await owner.remove()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(remote.db.sql("select result from public.nest_meal_removal_receipts"));
  remote.db.sql(`update public.meal_plan_entries set removed_at=null where id='${id(100)}'`);
  const retry = await owner.remove();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, stored);
  assert.equal(
    remote.db.sql(`select removed_at is null from public.meal_plan_entries where id='${id(100)}'`),
    "t",
  );
  assert.equal(
    (await connect(remote.partnerBearer).remove({ ...command, operationId: id(202) })).status,
    409,
  );
  assert.equal((await connect(remote.otherBearer).remove()).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/remove`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/remove`)).status, 405);
  assert.equal((await owner.remove({ ...command, actorId: id(2) })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await owner.remove()).status, 403);
});

test("removal HTTP closes actual linked preparation once and partner reads retain the removed history", async (t) => {
  const { remote, connect } = await backend(t);
  const definition = {
    title: "Prepare pasta",
    schedule: { kind: "one_off", date: "2026-09-22" },
    assignment: { policy: "shared" },
  };
  const created = JSON.parse(
    remote.db.sql(
      `set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}'; select public.nest_create_routine('${id(10)}','${id(300)}','${JSON.stringify(definition)}')`,
    ),
  );
  const occurrence = remote.db.sql(
    `select id from public.routine_occurrences where routine_id='${created.routineId}' and role='current'`,
  );
  remote.db.sql(
    `update public.routine_occurrences set meal_plan_entry_id='${id(100)}' where id='${occurrence}'`,
  );
  const response = await connect().remove();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.receipt.skippedPreparationId, occurrence);
  assert.equal(
    remote.db.sql(`select status from public.routine_occurrences where id='${occurrence}'`),
    "skipped",
  );
  assert.equal(
    remote.db.sql(
      `select count(*) from public.routine_occurrences where routine_id='${created.routineId}' and status='open'`,
    ),
    "0",
  );
  assert.deepEqual(await (await connect().remove()).json(), result);
  const week = await (await connect(remote.partnerBearer).read()).json();
  assert.equal(
    week.entries.some((entry) => entry.entryId === id(100)),
    false,
  );
  assert.equal(
    remote.db.sql(
      `select title_snapshot from public.meal_plan_entries where id='${id(100)}' and removed_at is not null`,
    ),
    "Pasta",
  );
});

test("uppercase entry identity succeeds and replays through real HTTP and PostgreSQL", async (t) => {
  const { remote, connect } = await backend(t);
  const entry = "ABCDEF00-0000-4000-8000-000000000900";
  remote.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${entry}','${id(10)}','2026-09-23','lunch','Soup')`,
  );
  const input = { ...command, entryId: entry, expectedRevision: "2" };
  const first = await connect().remove(input);
  assert.equal(first.status, 200);
  const result = await first.json();
  assert.equal(result.receipt.entryId, entry.toLowerCase());
  const retry = await connect().remove(input);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), result);
  assert.equal(remote.db.sql("select count(*) from public.nest_meal_removal_receipts"), "1");
});
