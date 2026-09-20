import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = {
  title: "Clean kitchen",
  schedule: { kind: "daily" },
  assignment: { policy: "shared" },
};
const command = { operationId: id(100), definition };
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    "tests/database/routine-creation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920082522_native_routine_creation.sql",
  ]);
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_create_routine")
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
      read: () => fetch(`${url}/v1/routines`, { headers }),
      create: (input = command) =>
        fetch(`${url}/v1/routines/create`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
    };
  };
  return { remote, proxy, connect, url };
}

test("real HTTP routine creation and shared reads preserve exact identity and initial occurrences", async (t) => {
  const { remote, connect, url } = await backend(t);
  const owner = connect();
  const empty = await owner.read();
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("cache-control"), "no-store");
  assert.deepEqual((await empty.json()).routines, []);
  const saved = await owner.create();
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).receipt;
  const snapshot = await (await owner.read()).json();
  assert.deepEqual(snapshot.routines, [
    { routineId: receipt.routineId, version: receipt.version, definition, state: "active" },
  ]);
  assert.deepEqual(await (await connect(remote.partnerBearer).read()).json(), snapshot);
  assert.equal((await connect(remote.otherBearer).read()).status, 403);
  assert.equal((await connect(remote.otherBearer).create()).status, 403);
  assert.equal((await fetch(`${url}/v1/routines`)).status, 401);
  assert.equal((await fetch(`${url}/v1/routines/create`)).status, 405);
  assert.equal(remote.db.sql("select count(*) from public.routine_occurrences"), "2");
});

test("lost creation acknowledgment returns the original receipt after later edits without duplicating work", async (t) => {
  const { remote, proxy, connect } = await backend(t, true);
  const owner = connect();
  assert.equal((await owner.create()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(
    remote.db.sql("select result from public.nest_routine_creation_receipts"),
  );
  remote.db.sql(
    `update public.routines set title='Partner changed this',updated_at='2026-09-20T08:00:00.000001Z' where id='${stored.routineId}'`,
  );
  const retry = await owner.create();
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).receipt, stored);
  const current = (await (await owner.read()).json()).routines[0];
  assert.equal(current.definition.title, "Partner changed this");
  assert.equal(current.version, "2026-09-20T08:00:00.000001Z");
  assert.equal(remote.db.sql("select count(*) from public.routines"), "1");
  assert.equal(
    (await owner.create({ ...command, definition: { ...definition, title: "Changed retry" } }))
      .status,
    400,
  );
  // Fixture-only administrative removal; historical activity normally retains its FK.
  remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.equal((await owner.read()).status, 403);
  assert.equal((await owner.create()).status, 403);
});

test("invalid requests do not mutate and historical Unicode titles remain readable", async (t) => {
  const { remote, connect } = await backend(t),
    owner = connect();
  for (const input of [
    { ...command, actorId: id(2) },
    {
      ...command,
      definition: { ...definition, assignment: { policy: "assigned", memberId: id(3) } },
    },
    {
      ...command,
      definition: {
        ...definition,
        schedule: { kind: "after_completion", every: 2147483647, unit: "weeks" },
      },
    },
    { ...command, definition: { ...definition, title: "x".repeat(9000) } },
  ])
    assert.equal((await owner.create(input)).status, 400);
  assert.equal(remote.db.sql("select count(*) from public.routines"), "0");
  assert.equal((await owner.create()).status, 200);
  remote.db.sql(`update public.routines set title='${"🧹".repeat(120)}',paused_at=now()`);
  const current = (await (await owner.read()).json()).routines[0];
  assert.equal(current.definition.title, "🧹".repeat(120));
  assert.equal(current.state, "paused");
  remote.db.sql("update public.routines set archived_at=now()");
  assert.deepEqual((await (await owner.read()).json()).routines, []);
});
