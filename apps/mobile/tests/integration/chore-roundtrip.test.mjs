import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { choreClient } from "../../src/chores/client.ts";
import { choreFlow } from "../../src/chores/flow.ts";
import { fixture as sqliteFixture, operation, lease } from "../offline-fixture.mjs";
const actor = "00000000-0000-4000-8000-000000000001";
const household = "00000000-0000-4000-8000-000000000010";

test("native client and restarted SQLite replay a lost real PostgreSQL receipt without a second completion", async (t) => {
  const remote = await postgrestFixture(t, [
    "tests/database/legacy-chore-fixture.sql",
    "tests/integration/chore-postgrest.sql",
    "tests/integration/chore-transfer-adapter.sql",
    "supabase/migrations/20260919205503_native_chore_receipts.sql",
  ]);
  const local = await sqliteFixture(t);
  const session = await Effect.runPromise(local.store.activate({ actor, household }, lease));
  const handler = createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" });
  const client = choreClient(
    "http://localhost/",
    { actor, household },
    Effect.succeed({ access_token: remote.bearer, user: { id: actor } }),
  );
  const server = nodeServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  let lose = true;
  const commands = [];
  const transport = async (input, init) => {
    const request = new Request(new URL(new URL(input).pathname, base), init);
    const mutation = new URL(request.url).pathname.endsWith("/complete");
    if (mutation) commands.push(await request.clone().json());
    const response = await fetch(request);
    if (mutation && lose && response.status === 200) {
      await response.arrayBuffer();
      throw new TypeError("Fixture response lost after commit");
    }
    return response;
  };
  const run = (effect) =>
    Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, transport)));
  let flow = choreFlow(local.store, session, client);
  await run(flow.sync);
  const initial = await run(flow.read);
  assert.equal(initial.chores.length, 12);
  const chore = initial.chores.find((item) => item.occurrenceId.endsWith("000100"));
  await run(flow.complete(chore, operation, "2026-09-19"));
  await assert.rejects(run(flow.sync), { code: "unavailable" });
  assert.equal(remote.db.sql("select count(*) from private.fixture_closure_calls"), "1");
  assert.equal((await run(flow.read)).pending.length, 1);
  const restarted = local.reopen();
  const next = await run(restarted.store.activate({ actor, household }, operation));
  flow = choreFlow(restarted.store, next, client);
  lose = false;
  await suspendAndRestore({ remote, flow, run, client, command: commands[0] });
  await run(flow.sync);
  assert.deepEqual(commands[0], commands[1]);
  assert.equal(remote.db.sql("select count(*) from private.fixture_closure_calls"), "1");
  assert.equal((await run(flow.read)).pending.length, 0);
  assert.equal((await run(flow.read)).chores.length, 11);
  const removed = (await run(flow.read)).chores[0];
  await run(flow.complete(removed, lease, "2026-09-19"));
  remote.db.sql(`delete from public.routine_occurrences where id='${removed.occurrenceId}'`);
  await run(flow.sync);
  assert.equal((await run(flow.read)).pending[0].reason, "removed");
  const another = (await run(flow.read)).chores[0];
  await run(flow.complete(another, "50000000-0000-4000-8000-000000000009", "2026-09-19"));
  remote.db.sql(`delete from public.household_members where user_id='${actor}'`);
  await assert.rejects(run(flow.sync), { code: "forbidden" });
  assert.equal((await run(flow.read)).pending.length, 2);
  assert.equal(remote.db.sql("select count(*) from private.fixture_closure_calls"), "1");
});

async function suspendAndRestore({ remote, flow, run, client, command }) {
  const signature = "public.nest_complete_chore(uuid,uuid,date,date)";
  remote.db.sql(`revoke execute on function ${signature} from authenticated`);
  await run(flow.sync);
  assert.equal((await run(flow.read)).pending.length, 0);
  await assert.rejects(run(client.complete({ ...command, operationId: lease })), {
    code: "unavailable",
  });
  await assert.rejects(run(client.complete({ ...command, completedOn: "2026-09-18" })), {
    code: "unavailable",
  });
  assert.equal(remote.db.sql("select count(*) from private.fixture_closure_calls"), "1");
  remote.db.sql(`grant execute on function ${signature} to authenticated`);
}
