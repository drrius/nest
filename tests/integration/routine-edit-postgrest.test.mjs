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
    "tests/database/routine-edit-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920082522_native_routine_creation.sql",
    "supabase/migrations/20260920093203_native_routine_editing.sql",
  ]);
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_edit_routine")
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
      edit: (input) =>
        fetch(`${url}/v1/routines/edit`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
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
const change = (receipt, operation = 201, patch = { title: "Edited" }) => ({
  operationId: id(operation),
  routineId: receipt.routineId,
  expectedVersion: receipt.version,
  patch,
});

test("real edit API preserves microseconds and stale, archived and invalid edits fail honestly", async (t) => {
  const { remote, connect, url } = await backend(t),
    owner = connect();
  const initial = (await (await owner.create()).json()).receipt;
  const saved = await owner.edit(change(initial));
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).receipt;
  assert.equal(receipt.action, "edit");
  assert.notEqual(receipt.version, initial.version);
  assert.equal((await owner.edit(change(initial, 202))).status, 409);
  assert.equal((await connect(remote.otherBearer).edit(change(receipt))).status, 403);
  assert.equal((await fetch(`${url}/v1/routines/edit`)).status, 405);
  for (const input of [
    { ...change(receipt), actorId: id(2) },
    change(receipt, 203, {}),
    change(receipt, 204, { title: "x".repeat(9000) }),
    change(receipt, 205, { assignment: { policy: "assigned", memberId: id(3) } }),
  ])
    assert.equal((await owner.edit(input)).status, 400);
  const current = (await (await owner.read()).json()).routines[0];
  assert.equal(current.definition.title, "Edited");
  remote.db.sql(`update public.routines set archived_at=now() where id='${receipt.routineId}'`);
  const version = remote.db.sql(
    `select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.routines where id='${receipt.routineId}'`,
  );
  assert.equal((await owner.edit(change({ ...receipt, version }, 206))).status, 409);
});

test("committed lost edit response replays after a partner edit without overwriting newer work", async (t) => {
  const { remote, proxy, connect } = await backend(t, true),
    owner = connect();
  const initial = (await (await owner.create()).json()).receipt;
  const input = change(initial);
  assert.equal((await owner.edit(input)).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(remote.db.sql("select result from public.nest_routine_edit_receipts"));
  const partner = await connect(remote.partnerBearer).edit(
    change(stored, 202, { title: "Partner's newer edit" }),
  );
  assert.equal(partner.status, 200);
  const replay = await owner.edit(input);
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).receipt, stored);
  assert.equal(
    (await (await owner.read()).json()).routines[0].definition.title,
    "Partner's newer edit",
  );
  assert.equal((await owner.edit({ ...input, patch: { title: "Changed retry" } })).status, 400);
  remote.db.sql(`delete from public.push_outbox; delete from public.inbox_notifications;
    delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await owner.edit(input)).status, 403);
});

test("routine row contention returns a conflict and leaves the edit unapplied", async (t) => {
  const { remote, connect } = await backend(t),
    owner = connect();
  const initial = (await (await owner.create()).json()).receipt;
  const blocker = remote.db.concurrent(`begin; set application_name='nest_edit_lock';
    select 1 from public.routines where id='${initial.routineId}' for update;
    select pg_sleep(2); commit`);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      ready =
        remote.db.sql(
          "select exists(select 1 from pg_stat_activity where application_name='nest_edit_lock' and wait_event='PgSleep')",
        ) === "t";
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(ready, true, "blocker must hold the routine row before the request");
    assert.equal((await owner.edit(change(initial))).status, 409);
    assert.equal(remote.db.sql("select count(*) from public.nest_routine_edit_receipts"), "0");
  } finally {
    await blocker;
  }
  assert.equal((await owner.edit(change(initial))).status, 200);
});
