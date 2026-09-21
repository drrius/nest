import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("API and AI explain all retained financial event kinds through the same authorized detail read", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
    "tests/database/money-detail-seed.sql",
  ]);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const request = (query, bearer = f.bearer) =>
    new Request(`http://localhost/v1/money/detail${query}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const tool = moneyTools(request(""), config).readMoneyDetail;
  for (let n = 100; n <= 105; n++) {
    const response = await handler(request(`?eventId=${id(n)}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.event.eventId, id(n));
    assert.deepEqual(
      await (await handler(request(`?eventId=${id(n)}`, f.partnerBearer))).json(),
      result,
    );
    assert.deepEqual(
      await tool.execute({ eventId: id(n) }, { toolCallId: "detail", messages: [] }),
      { ok: true, value: result },
    );
  }
  for (const query of [
    "",
    "?eventId=bad",
    `?eventId=${id(100)}&eventId=${id(100)}`,
    `?eventId=${id(100)}&householdId=${id(10)}`,
  ])
    assert.equal((await handler(request(query))).status, 400);
  assert.equal((await handler(request(`?eventId=${id(999)}`))).status, 410);
  assert.equal((await handler(request(`?eventId=${id(100)}`, f.otherBearer))).status, 403);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "6");
  f.db
    .sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_by_member_id,payer_member_id,description,amount_cents)
    values('${id(200)}','${id(10)}','expense','2026-09-21','${id(1)}','${id(1)}','Invalid split',101);
    insert into public.financial_allocations(household_id,financial_event_id,member_id,allocated_cents) values
    ('${id(10)}','${id(200)}','${id(1)}',50),('${id(10)}','${id(200)}','${id(2)}',50);
    insert into public.ledger_entries(household_id,financial_event_id,member_id,receivable_delta_cents) values
    ('${id(10)}','${id(200)}','${id(1)}',50),('${id(10)}','${id(200)}','${id(2)}',-50)`);
  assert.equal((await handler(request(`?eventId=${id(200)}`))).status, 503);
  const rejected = await tool.execute(
    { eventId: id(200) },
    { toolCallId: "invalid", messages: [] },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "unavailable");
});
