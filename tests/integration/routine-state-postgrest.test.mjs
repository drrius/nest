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
    "tests/database/legacy-routine-edits/lifecycle.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920082522_native_routine_creation.sql",
    "supabase/migrations/20260920093203_native_routine_editing.sql",
    "supabase/migrations/20260920101012_native_routine_lifecycle.sql",
  ]);
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_set_routine_state")
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
      state: (input) =>
        fetch(`${url}/v1/routines/state`, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
      chores: () => fetch(`${url}/v1/chores`, { headers }),
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
const change = (receipt, operation, action) => ({
  operationId: id(operation),
  routineId: receipt.routineId,
  expectedVersion: receipt.version,
  action,
});

test("lifecycle HTTP commands hide paused/archived work from Today and resume preserves identity", async (t) => {
  const { connect } = await backend(t),
    owner = connect();
  const created = (await (await owner.create()).json()).receipt;
  const chores = (await (await owner.chores()).json()).chores;
  assert.equal(chores.length, 1);
  const paused = await owner.state(change(created, 201, "pause"));
  assert.equal(paused.status, 200);
  const pauseReceipt = (await paused.json()).receipt;
  assert.deepEqual((await (await owner.chores()).json()).chores, []);
  assert.equal((await (await owner.read()).json()).routines[0].state, "paused");
  const resumed = await owner.state(change(pauseReceipt, 202, "resume"));
  assert.equal(resumed.status, 200);
  const resumeReceipt = (await resumed.json()).receipt;
  assert.deepEqual((await (await owner.chores()).json()).chores, chores);
  assert.equal((await owner.state(change(created, 203, "archive"))).status, 409);
  assert.equal((await owner.state(change(resumeReceipt, 204, "archive"))).status, 200);
  assert.deepEqual((await (await owner.chores()).json()).chores, []);
  assert.deepEqual((await (await owner.read()).json()).routines, []);
});

test("lost pause acknowledgment never undoes a later partner resume and revoked access cannot replay", async (t) => {
  const { remote, connect, proxy } = await backend(t, true),
    owner = connect();
  const created = (await (await owner.create()).json()).receipt;
  const input = change(created, 201, "pause");
  assert.equal((await owner.state(input)).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(remote.db.sql("select result from public.nest_routine_state_receipts"));
  const partner = connect(remote.partnerBearer);
  assert.equal((await partner.state(change(stored, 202, "resume"))).status, 200);
  const replay = await owner.state(input);
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).receipt, stored);
  assert.equal((await (await owner.read()).json()).routines[0].state, "active");
  assert.equal((await owner.state({ ...input, action: "archive" })).status, 400);
  assert.equal((await connect(remote.otherBearer).state(input)).status, 403);
  remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.equal((await owner.state(input)).status, 403);
});
