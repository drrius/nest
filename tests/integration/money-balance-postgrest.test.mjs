import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("API and AI balance read authorize the same complete ledger and refuse malformed requests or revoked membership", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
  ]);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const request = (bearer = f.bearer, path = "/v1/money/balance") =>
    new Request(`http://localhost${path}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const value = await response.json();
  assert.equal(value.eventCount, "0");
  assert.deepEqual(await (await handler(request(f.partnerBearer))).json(), value);
  assert.deepEqual(
    await moneyTools(request(), config).readMoneyBalance.execute(
      {},
      { toolCallId: "balance", messages: [] },
    ),
    { ok: true, value },
  );
  assert.equal((await handler(request(f.otherBearer))).status, 403);
  assert.equal(
    (await handler(request(f.bearer, `/v1/money/balance?householdId=${id(20)}`))).status,
    400,
  );
  assert.equal((await handler(new Request("http://localhost/v1/money/balance"))).status, 401);
  assert.equal((await handler(new Request(request(), { method: "POST" }))).status, 405);
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.equal((await handler(request(f.partnerBearer))).status, 403);
  assert.equal((await handler(request())).status, 503);
  assert.deepEqual(
    await moneyTools(request(f.partnerBearer), config).readMoneyBalance.execute(
      {},
      { toolCallId: "revoked", messages: [] },
    ),
    { ok: false, code: "forbidden" },
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
