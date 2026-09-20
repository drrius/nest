import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { choreTransferFiles } from "../../../../tests/database/chore-transfer-files.mjs";
import { choreClient } from "../../src/chores/client.ts";
import { choreFlow } from "../../src/chores/flow.ts";
import { choreRuntime } from "../../src/chores/runtime.ts";
import { routineClient } from "../../src/routines/client.ts";
import { fixture, run } from "../offline-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_change_chore");
  const server = nodeServer(
    createHandler({ url: proxy.url, publishableKey: "sb_publishable_fixture" }),
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
  const credentials = (actor = id(1), bearer = remote.bearer) =>
    Effect.succeed({ user: { id: actor }, access_token: bearer });
  const account = { actor: id(1), household: id(10) };
  const chores = choreClient(url, account, credentials());
  const routines = routineClient(url, account, credentials());
  const created = await run(
    routines.create({
      operationId: id(100),
      definition: {
        title: "Native chore changes",
        schedule: { kind: "daily" },
        assignment: { policy: "shared" },
      },
    }),
  );
  const partner = routineClient(
    url,
    { ...account, actor: id(2) },
    credentials(id(2), remote.partnerBearer),
  );
  const local = await fixture(t);
  const session = await run(local.store.activate(account, id(90)));
  const views = [];
  const runtime = choreRuntime(choreFlow(local.store, session, chores), (view) => views.push(view));
  t.after(() => runtime.dispose());
  await runtime.refresh();
  return {
    remote,
    proxy,
    runtime,
    routines,
    partner,
    created,
    store: local.store,
    session,
    view: () => views.at(-1),
  };
}
test("native SQLite/controller/client recover lost reschedule receipt after partner rebuild, then skip the new current occurrence", async (t) => {
  const f = await backend(t);
  const original = f.view().data.chores[0];
  const date = f.remote.db.sql(`select ('${original.dueDate}'::date+1)::text`);
  await f.runtime.reschedule(original, id(101), date);
  assert.equal(f.proxy.dropped(), 1);
  assert.equal(f.view().changeStage, "uncertain");
  await f.runtime.complete(original, id(105), original.dueDate);
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
  await run(
    f.partner.edit({
      operationId: id(102),
      routineId: f.created.routineId,
      expectedVersion: f.created.version,
      patch: { schedule: { kind: "weekly", weekday: 3 } },
    }),
  );
  assert.equal(
    f.remote.db.sql(
      `select count(*) from public.routine_occurrences where id='${original.occurrenceId}'`,
    ),
    "0",
  );
  await f.runtime.retryChange();
  assert.equal(f.view().changeStage, "ready");
  const current = f.view().data.chores[0];
  assert.notEqual(current.occurrenceId, original.occurrenceId);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_change_receipts"), "1");
  await f.runtime.skip(current, id(103));
  assert.equal(f.view().changeStage, "ready");
  assert.notEqual(f.view().data.chores[0].occurrenceId, current.occurrenceId);
  assert.equal(
    f.remote.db.sql(
      `select status::text from public.routine_occurrences where id='${current.occurrenceId}'`,
    ),
    "skipped",
  );
  assert.equal(f.remote.db.sql("select count(*) from public.routine_completions"), "0");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_change_receipts"), "2");
});
test("native exact skip retry is denied after membership revocation and cannot enqueue offline completion", async (t) => {
  const f = await backend(t);
  const original = f.view().data.chores[0];
  await f.runtime.skip(original, id(101));
  assert.equal(f.view().changeStage, "uncertain");
  f.remote.db.sql(`delete from public.push_outbox; delete from public.inbox_notifications;
    delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`);
  await f.runtime.retryChange();
  assert.equal(f.view().access, "verify");
  assert.equal(f.view().data, null);
  assert.equal(f.view().pendingWrite, false);
  await f.runtime.complete(original, id(102), original.dueDate);
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_change_receipts"), "1");
});
