import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("history API and AI read all pages with scoped cursors and reject revoked/foreign reads", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921104133_native_money_history_read.sql",
  ]);
  f.db
    .sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents)
    select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'${id(10)}','expense','2026-09-21','${id(1)}','${id(1)}','Synthetic',101 from generate_series(1,60)g`);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const request = (query = "", bearer = f.bearer) =>
    new Request(`http://localhost/v1/money/history${query}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const firstResponse = await handler(request());
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get("cache-control"), "no-store");
  const first = await firstResponse.json();
  assert.equal(first.events.length, 50);
  const second = await (await handler(request(`?before=${first.next}`, f.partnerBearer))).json();
  assert.equal(second.events.length, 10);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.events, ...second.events].map((row) => row.eventId)).size, 60);
  const tool = moneyTools(request(), config).readMoneyHistory;
  assert.deepEqual(
    await tool.execute({ before: first.next }, { toolCallId: "page", messages: [] }),
    { ok: true, value: second },
  );
  for (const query of [
    "?before=bad",
    `?before=${first.next}&before=${first.next}`,
    "?householdId=other",
  ])
    assert.equal((await handler(request(query))).status, 400);
  assert.equal((await handler(request(`?before=${id(999)}`))).status, 410);
  assert.equal((await handler(request("", f.otherBearer))).status, 403);
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.equal((await handler(request("", f.partnerBearer))).status, 403);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "60");
});
