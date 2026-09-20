import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { memoryClient } from "../../src/memory/client.ts";
import { MemoryRuntime } from "../../src/memory/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uuid = (start) => {
  let n = start;
  return () => id(n++);
};
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260919213407_native_action_approvals.sql",
    "supabase/migrations/20260920054303_native_private_memory.sql",
    "supabase/migrations/20260920055247_native_memory_confirmation.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
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
  const connect = (address = url, actor = id(1), bearer = remote.bearer) =>
    memoryClient(
      address,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
test("native explicit consent recovers a lost acknowledgment without restoring memory deleted on another device", async (t) => {
  const { remote, url, connect } = await backend(t);
  const proxy = await lostResponseProxy(t, url, "/v1/memories/decide");
  const first = new MemoryRuntime(connect(proxy.url), uuid(100));
  const second = new MemoryRuntime(connect(), uuid(200));
  t.after(() => {
    first.dispose();
    second.dispose();
  });
  await first.load();
  await first.propose("Private morning preference");
  const approvalId = first.getSnapshot().approval.id;
  assert.equal(remote.db.sql("select count(*) from public.nest_memories"), "0");
  await first.decide(true);
  assert.equal(proxy.dropped(), 1);
  assert.equal(first.getSnapshot().stage, "uncertain");
  await second.load();
  assert.equal(second.getSnapshot().items.length, 1);
  await second.remove(second.getSnapshot().items[0]);
  await first.retry();
  assert.equal(first.getSnapshot().stage, "ready");
  assert.deepEqual(first.getSnapshot().items, []);
  assert.equal(remote.db.sql("select count(*) from public.nest_memory_receipts"), "2");
  const reopened = new MemoryRuntime(connect(), uuid(300));
  const partner = new MemoryRuntime(
    connect(url, id(2), remote.partnerBearer),
    uuid(400),
    approvalId,
  );
  t.after(() => {
    reopened.dispose();
    partner.dispose();
  });
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().items, []);
  await partner.load();
  assert.equal(partner.getSnapshot().stage, "verify");
  assert.equal(partner.getSnapshot().approval, null);
});

test("native memory conflict reloads current data and permits denial, while revocation clears drafts and receipts", async (t) => {
  const { remote, connect } = await backend(t);
  const first = new MemoryRuntime(connect(), uuid(100));
  const second = new MemoryRuntime(connect(), uuid(200));
  t.after(() => {
    first.dispose();
    second.dispose();
  });
  await first.load();
  await first.propose("Original");
  await first.decide(true);
  await second.load();
  await first.propose("First device edit", first.getSnapshot().items[0]);
  await first.decide(true);
  await second.propose("Stale edit", second.getSnapshot().items[0]);
  await second.decide(true);
  assert.equal(second.getSnapshot().stage, "conflict");
  await second.load();
  assert.equal(second.getSnapshot().items[0].content, "First device edit");
  await second.decide(true);
  assert.equal(remote.db.sql("select count(*) from public.nest_memory_receipts"), "2");
  await second.decide(false);
  assert.equal(second.getSnapshot().approval, null);
  const generation = second.getSnapshot().generation;
  remote.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await second.load();
  assert.equal(second.getSnapshot().stage, "verify");
  assert.deepEqual(second.getSnapshot().items, []);
  assert.ok(second.getSnapshot().generation > generation);
});
