import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { moneyReadOperations } from "../../apps/mobile/src/money/read-operations.ts";
import { MoneyReadRuntime } from "../../apps/mobile/src/money/read-runtime.ts";
import { fixture, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("Money runtime persists actual API reads, restores after process reopen/offline and clears on denied credentials", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
    "supabase/migrations/20260921104133_native_money_history_read.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "tests/database/money-detail-seed.sql",
  ]);
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  let unavailable = false;
  const server = nodeServer((request) =>
    unavailable ? Promise.resolve(new Response(null, { status: 503 })) : handler(request),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const local = await fixture(t),
    session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(800)));
  let bearer = f.bearer;
  const client = moneyClient(
    `http://127.0.0.1:${server.address().port}/`,
    session,
    Effect.sync(() => ({ user: { id: id(1) }, access_token: bearer })),
  );
  const targets = [
      { kind: "balance" },
      { kind: "history", before: null },
      { kind: "detail", eventId: id(100) },
    ],
    snapshots = [];
  for (const target of targets) {
    const runtime = new MoneyReadRuntime(
      moneyReadOperations({ store: local.store, session }, client),
      target,
    );
    await runtime.setActive(true);
    assert.equal(runtime.getSnapshot().source, "online");
    snapshots.push(runtime.getSnapshot().entry);
    runtime.dispose();
  }
  const reopened = local.reopen();
  unavailable = true;
  const account = { store: reopened.store, session };
  for (let n = 0; n < targets.length; n++) {
    const runtime = new MoneyReadRuntime(moneyReadOperations(account, client), targets[n]);
    await runtime.setActive(true);
    assert.equal(runtime.getSnapshot().source, "saved");
    assert.deepEqual(runtime.getSnapshot().entry, snapshots[n]);
    assert.match(runtime.getSnapshot().notice, /Could not refresh/);
    runtime.dispose();
  }
  unavailable = false;
  bearer = f.otherBearer;
  const denied = new MoneyReadRuntime(moneyReadOperations(account, client), targets[0]);
  await denied.setActive(true);
  assert.equal(denied.getSnapshot().access, "verify");
  assert.equal(denied.getSnapshot().entry, null);
  assert.equal(
    reopened.connection.prepare("select count(*) n from offline_money_reads").get().n,
    0,
  );
  assert.equal(reopened.connection.prepare("select count(*) n from offline_operations").get().n, 0);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "6");
  denied.dispose();
});
