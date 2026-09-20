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
  const url = `http://127.0.0.1:${server.address().port}/`;
  const connect = (actor = id(1), bearer = remote.bearer) =>
    routineClient(
      url,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, proxy, connect, url };
}

test("native routine runtime recovers a committed lost acknowledgment, sees partner edits and clears revoked access", async (t) => {
  const { remote, proxy, connect } = await backend(t, true);
  const runtime = new RoutineRuntime(connect(), () => id(100));
  const partner = new RoutineRuntime(connect(id(2), remote.partnerBearer), () => id(101));
  t.after(() => {
    runtime.dispose();
    partner.dispose();
  });
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot.routines.length, 0);
  await runtime.create({
    title: "Water plants",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  });
  assert.equal(proxy.dropped(), 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(remote.db.sql("select count(*) from public.routines"), "1");
  remote.db.sql("update public.routines set title='Partner revised title'");
  await runtime.retry();
  assert.equal(runtime.getSnapshot().stage, "ready");
  assert.equal(
    runtime.getSnapshot().snapshot.routines[0].definition.title,
    "Partner revised title",
  );
  assert.equal(remote.db.sql("select count(*) from public.routines"), "1");
  assert.equal(remote.db.sql("select count(*) from public.routine_occurrences"), "2");
  await partner.load();
  assert.deepEqual(partner.getSnapshot().snapshot, runtime.getSnapshot().snapshot);
  remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().stage, "verify");
});
