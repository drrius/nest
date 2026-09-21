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

test("retained dates outside native ranges remain readable and correctly paged through API and AI", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-ledger-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921104133_native_money_history_read.sql",
  ]);
  const dates = [
    "infinity",
    "5874897-12-31",
    "10000-01-01",
    "2026-09-21",
    "0001-01-01 BC",
    "4713-01-01 BC",
    "-infinity",
  ];
  const times = [
    "infinity",
    "294276-12-31 23:59:59.999999+00",
    "10000-01-01+00",
    "2026-09-21+00",
    "0001-01-01+00 BC",
    "4713-01-01+00 BC",
    "-infinity",
  ];
  for (let n = 0; n < dates.length; n++)
    f.db
      .sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_at,created_by_member_id,payer_member_id,description,amount_cents)
      select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'${id(10)}','expense','${dates[n]}','${times[n]}','${id(1)}','${id(1)}','Retained',101
      from generate_series(${n * 20 + 100},${n * 20 + 119})g`);
  for (let n = 0; n < times.length; n++)
    f.db
      .sql(`insert into public.financial_events(id,household_id,type,occurred_on,created_at,created_by_member_id,payer_member_id,description,amount_cents)
      values('${id(500 + n)}','${id(10)}','expense','2026-09-21','${times[n]}','${id(1)}','${id(1)}','Time tie',101)`);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const request = (before) =>
    new Request(`http://localhost/v1/money/history${before ? `?before=${before}` : ""}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
  const found = [];
  let cursor = null;
  do {
    const response = await handler(request(cursor));
    assert.equal(response.status, 200);
    const page = await response.json();
    const result = await moneyTools(request(cursor), config).readMoneyHistory.execute(
      { before: cursor },
      { toolCallId: "retained", messages: [] },
    );
    assert.deepEqual(result, { ok: true, value: page });
    found.push(...page.events);
    cursor = page.next;
  } while (cursor);
  const expected = JSON.parse(
    f.db.sql(
      "select json_agg(id order by occurred_on desc,created_at desc,id desc) from public.financial_events",
    ),
  );
  assert.deepEqual(
    found.map((row) => row.eventId),
    expected,
  );
  assert.equal(found.length, 147);
  assert.deepEqual([...new Set(found.map((row) => row.occurredOn))], dates);
  assert.equal(found[0].createdAt, "infinity");
  assert.equal(found.at(-1).createdAt, "-infinity");
  assert.equal(
    found.find((row) => row.occurredOn === dates[4]).createdAt,
    "0001-01-01T00:00:00.000000Z BC",
  );
});
