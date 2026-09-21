import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { correct, replacement, id } from "../database/money-correction-fixture.mjs";
test("retained corrected opening lineage reads through authorized balance, history, detail and AI without resetting history", async (t) => {
  const f = await postgrestFixture(t, [
    "tests/database/money-expense-fixture.sql",
    "tests/database/legacy-money/opening-correction-lineage.sql",
    "tests/database/legacy-money/correction-command.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
    "supabase/migrations/20260921104133_native_money_history_read.sql",
    "supabase/migrations/20260921105214_native_money_detail_read.sql",
  ]);
  const root = f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Opening',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
  );
  const change = { ...replacement(200, 0), allocations: null };
  const result = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; ${correct(root, "correct", change)}`,
    ),
  );
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" },
    handler = createHandler(config);
  const request = (path, bearer = f.bearer) =>
    new Request(`http://localhost/v1/money/${path}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const read = async (path, bearer) => {
    const response = await handler(request(path, bearer));
    assert.equal(response.status, 200);
    return response.json();
  };
  const history = await read("history");
  assert.equal(history.events.length, 3);
  const successor = history.events.find((event) => event.eventId === result.replacement_event_id);
  assert.equal(successor.kind, "opening_balance");
  assert.equal(successor.relatedEventId, root);
  const detail = await read(`detail?eventId=${successor.eventId}`);
  assert.equal(detail.event.relatedEventId, root);
  assert.deepEqual(await read(`detail?eventId=${successor.eventId}`, f.partnerBearer), detail);
  const tools = moneyTools(request("history"), config);
  assert.deepEqual(
    await tools.readMoneyHistory.execute({ before: null }, { toolCallId: "history", messages: [] }),
    { ok: true, value: history },
  );
  assert.deepEqual(
    await tools.readMoneyDetail.execute(
      { eventId: successor.eventId },
      { toolCallId: "detail", messages: [] },
    ),
    { ok: true, value: detail },
  );
  const balance = await read("balance");
  assert.equal(balance.eventCount, "3");
  assert.equal(balance.openingEstablished, true);
  assert.equal(balance.members.find((member) => member.actorId === id(1)).centimes, "200");
  assert.equal((await handler(request("history", f.otherBearer))).status, 403);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
});
