import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { recurringRuntimeHandler } from "../../apps/api/recurring-runtime.mjs";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { fixture as worker } from "./recurring-worker-fixture.mjs";

async function fixture(t, enabled = "true") {
  const f = await worker(t, [
    "supabase/migrations/20260922002959_native_recurring_worker_checkpoint.sql",
  ]);
  const token = randomBytes(32).toString("hex");
  const server = nodeServer(
    recurringRuntimeHandler({
      NEST_RECURRING_WORKER_ENABLED: enabled,
      NEST_SUPABASE_URL: f.supabaseUrl,
      NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
      NEST_SUPABASE_RECURRING_SECRET: f.serverKey,
      NEST_RECURRING_SCHEDULER_TOKEN: token,
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/internal/recurring/run`;
  return { ...f, url, token };
}

test("default-disabled host cannot claim or post even with the scheduler token", async (t) => {
  const f = await fixture(t, "false");
  await f.add(800);
  const response = await fetch(f.url, { headers: { authorization: `Bearer ${f.token}` } });
  assert.equal(response.status, 404);
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_runs"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});

test("enabled host retains authenticated bounded continuation and duplicate-proof cycles", async (t) => {
  const f = await fixture(t);
  for (let n = 800; n < 806; n++) await f.add(n);
  for (const token of [f.bearer, f.serverKey, "0".repeat(64)]) {
    assert.equal(
      (await fetch(f.url, { headers: { authorization: `Bearer ${token}` } })).status,
      401,
    );
  }
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_runs"), "0");
  const send = () => fetch(f.url, { headers: { authorization: `Bearer ${f.token}` } });
  const first = await send();
  assert.equal(first.status, 200);
  const one = await first.json();
  assert.equal(one.processed, 5);
  assert.equal(one.complete, false);
  assert.equal(one.failed, 0);
  const second = await send();
  assert.equal(second.status, 200);
  const two = await second.json();
  assert.equal(two.processed, 1);
  assert.equal(two.complete, true);
  assert.notEqual(one.runId, two.runId);
  assert.equal((await (await send()).json()).processed, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "6");
  assert.deepEqual(Object.keys(one).sort(), [
    "complete",
    "failed",
    "processed",
    "runId",
    "scanFailure",
  ]);
});
