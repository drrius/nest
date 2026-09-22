import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { createRecurringScheduler } from "../../apps/api/src/money/recurring-scheduler-handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Redacted = require("effect/Redacted");
async function fixture(t) {
  const f = await worker(t, [
    "supabase/migrations/20260922002959_native_recurring_worker_checkpoint.sql",
  ]);
  const token = randomBytes(32).toString("hex");
  const config = { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" };
  const handler = createRecurringScheduler(
    config,
    Redacted.make(f.serverKey),
    Redacted.make(token),
  );
  const server = nodeServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/internal/recurring/run`;
  const send = (options = {}) =>
    fetch(url, { headers: { authorization: `Bearer ${token}` }, ...options });
  return { ...f, token, config, url, send };
}
test("scheduler denies user/server credentials and request overrides before claiming work", async (t) => {
  const f = await fixture(t);
  await f.add(800);
  for (const token of ["", f.bearer, f.serverKey, "0".repeat(64)]) {
    const response = await f.send({ headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await f.send({ method: "POST", body: "{}" })).status, 405);
  assert.equal(
    (await fetch(`${f.url}?budget=25`, { headers: { authorization: `Bearer ${f.token}` } })).status,
    400,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_runs"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  assert.throws(() =>
    createRecurringScheduler(f.config, Redacted.make(f.serverKey), Redacted.make("weak")),
  );
});
test("authenticated scheduler bounds work and continues next invocation without duplicate cycles", async (t) => {
  const f = await fixture(t);
  for (let n = 800; n < 806; n++) await f.add(n);
  const first = await f.send();
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.processed, 5);
  assert.equal(firstBody.complete, false);
  assert.equal(firstBody.failed, 0);
  assert.equal("after" in firstBody, false);
  const second = await f.send();
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.processed, 1);
  assert.equal(secondBody.complete, true);
  assert.notEqual(secondBody.runId, firstBody.runId);
  assert.equal((await (await f.send()).json()).processed, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "6");
});
test("scheduler reports existing lease contention and backend failure without secrets", async (t) => {
  const f = await fixture(t);
  await f.add(800);
  await run(f.rpc("claim", { p_run: id(900), p_budget: 1 }));
  const busy = await f.send();
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { error: "worker_busy_or_expired" });
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  const bad = createRecurringScheduler(
    f.config,
    Redacted.make("sb_secret_wrong"),
    Redacted.make(f.token),
  );
  const result = await bad(new Request(f.url, { headers: { authorization: `Bearer ${f.token}` } }));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "unavailable" });
});

test("scheduler exposes failed posting and retries it on a later sweep without partial finances", async (t) => {
  const f = await fixture(t);
  await f.add(800);
  f.db.sql(`create function private.fail_worker_receipt() returns trigger language plpgsql as $$
    begin raise exception 'Injected job receipt failure'; end $$;
    create trigger fail_worker_receipt before insert on private.nest_recurring_job_receipts
    for each row execute function private.fail_worker_receipt();`);
  const failed = await f.send();
  assert.equal(failed.status, 503);
  const report = await failed.json();
  assert.equal(report.processed, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.complete, true);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  f.db.sql("drop trigger fail_worker_receipt on private.nest_recurring_job_receipts");
  const recovered = await f.send();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).processed, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
