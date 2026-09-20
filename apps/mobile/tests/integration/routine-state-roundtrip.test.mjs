import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { routineClient } from "../../src/routines/client.ts";
import { RoutineRuntime } from "../../src/routines/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    "tests/database/routine-edit-fixture.sql",
    "supabase/migrations/20260920143047_native_chore_transfer_storage.sql",
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
  const url = `http://127.0.0.1:${server.address().port}/`;
  const connect = (actor = id(1), bearer = remote.bearer) =>
    routineClient(
      url,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, proxy, connect, url };
}

test("native lifecycle recovers a committed pause after partner resume and archives without losing history", async (t) => {
  const { remote, proxy, connect } = await backend(t, true);
  let operation = 100;
  const runtime = new RoutineRuntime(connect(), () => id(operation++));
  const partner = new RoutineRuntime(connect(id(2), remote.partnerBearer), () => id(operation++));
  t.after(() => {
    runtime.dispose();
    partner.dispose();
  });
  await runtime.load();
  await runtime.create({
    title: "Clean",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  });
  const original = runtime.getSnapshot().snapshot.routines[0];
  await runtime.setState(original, "pause");
  assert.equal(proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await partner.load();
  assert.equal(partner.getSnapshot().snapshot.routines[0].state, "paused");
  await partner.setState(partner.getSnapshot().snapshot.routines[0], "resume");
  await runtime.retry();
  assert.equal(runtime.getSnapshot().stage, "ready");
  assert.equal(runtime.getSnapshot().snapshot.routines[0].state, "active");
  assert.equal(remote.db.sql("select count(*) from public.nest_routine_state_receipts"), "2");
  await runtime.setState(original, "archive");
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.load();
  await runtime.setState(runtime.getSnapshot().snapshot.routines[0], "archive");
  assert.equal(runtime.getSnapshot().stage, "ready");
  assert.deepEqual(runtime.getSnapshot().snapshot.routines, []);
  assert.equal(
    remote.db.sql(
      `select count(*) from public.routines where id='${original.routineId}' and archived_at is not null`,
    ),
    "1",
  );
  assert.equal(
    remote.db.sql(
      `select count(*) from public.routine_occurrences where routine_id='${original.routineId}'`,
    ),
    "1",
  );
});
