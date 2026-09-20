import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealPlacementFiles } from "../database/meal-placement-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = {
  operationId: id(201),
  weekStart: "2026-09-21",
  expectedRevision: "0",
  date: "2026-09-22",
  slot: "lunch",
  title: "Pasta",
};
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...mealPlacementFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_place_meal")
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
      place: (input = command) =>
        fetch(`${url}/v1/meals/place`, { method: "POST", headers, body: JSON.stringify(input) }),
    };
  };
  return { remote, proxy, url, connect };
}

test("real placement HTTP preserves exact identity, exposes current partner reads and conflicts on stale weeks", async (t) => {
  const { remote, url, connect } = await backend(t),
    owner = connect();
  const saved = await owner.place();
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "no-store");
  const { version, receipt } = await saved.json();
  assert.equal(version, 1);
  assert.equal(receipt.revision, "1");
  const week = await (await connect(remote.partnerBearer).read()).json();
  assert.equal(week.revision, "1");
  assert.equal(week.entries.find((entry) => entry.entryId === receipt.entryId).title, "Pasta");
  assert.equal(
    (
      await connect(remote.partnerBearer).place({
        ...command,
        operationId: id(202),
        date: "2026-09-23",
      })
    ).status,
    409,
  );
  assert.equal((await connect(remote.otherBearer).place()).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/place`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/place`)).status, 405);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { date: "2026-09-28" },
    { title: "a".repeat(9000) },
  ])
    assert.equal((await owner.place({ ...command, ...patch })).status, 400);
  assert.equal(remote.db.sql("select count(*) from public.nest_meal_placement_receipts"), "1");
  assert.equal(
    remote.db.sql(
      "select count(*) from public.meal_plan_entries where groceries_materialized_at is not null",
    ),
    "0",
  );
});

test("lost placement acknowledgment retries unchanged after partner removal and denies revoked recovery", async (t) => {
  const { remote, proxy, connect } = await backend(t, true),
    owner = connect();
  assert.equal((await owner.place()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(
    remote.db.sql("select result from public.nest_meal_placement_receipts"),
  );
  remote.db.sql(
    `update public.meal_plan_entries set removed_at=now() where id='${stored.entryId}'`,
  );
  const retry = await owner.place();
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).receipt, stored);
  const week = await (await owner.read()).json();
  assert.equal(week.revision, "2");
  assert.equal(
    week.entries.some((entry) => entry.entryId === stored.entryId),
    false,
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_meal_placement_receipts"), "1");
  assert.equal((await owner.place({ ...command, title: "Changed retry" })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await owner.place()).status, 403);
});
