import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("native Money client reads exact ledger data through real HTTP and recovers a dropped read without writes", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
    "supabase/migrations/20260921104133_native_money_history_read.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "tests/database/money-detail-seed.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const proxy = await lostResponseProxy(
    t,
    `http://127.0.0.1:${server.address().port}/`,
    "/v1/money/balance",
  );
  const client = moneyClient(
    proxy.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  await assert.rejects(Effect.runPromise(client.balance()), { code: "unavailable" });
  const balance = await Effect.runPromise(client.balance());
  assert.equal(
    balance.members.find((member) => member.actorId === id(1)).centimes,
    "9007199254740991",
  );
  const history = await Effect.runPromise(client.history());
  assert.equal(history.events.length, 6);
  assert.equal(history.events[0].occurredOn, "infinity");
  const detail = await Effect.runPromise(client.detail(id(100)));
  assert.equal(detail.reversedById, id(101));
  assert.equal(detail.shares[0].allocatedCentimes, "51");
  await assert.rejects(Effect.runPromise(client.detail(id(999))), { code: "unavailable" });
  const wrong = moneyClient(
    proxy.url,
    { actor: id(3), household: id(10) },
    Effect.succeed({ user: { id: id(3) }, access_token: f.otherBearer }),
  );
  for (const read of [wrong.balance(), wrong.history(), wrong.detail(id(100))])
    await assert.rejects(Effect.runPromise(read), { code: "forbidden" });
  assert.equal(proxy.dropped(), 1);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "6");
});
