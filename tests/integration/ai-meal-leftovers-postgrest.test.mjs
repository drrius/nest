import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, week, id } from "../database/ai-meal-leftovers-fixture.mjs";
import { input as selectionInput } from "../database/ai-recipe-selection-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function setup(t) {
  const remote = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Place the saved soup recipe on Monday for dinner",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`);
  const connect = (lossy = false, bearer = remote.bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } }),
      { url: lossy ? proxy.url : remote.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn },
    ).tools;
  return { remote, proxy, turn, connect };
}

test("SDK leftovers reconcile lost journal response and preserve snapshots across library edits", async (t) => {
  const f = await setup(t);
  const source = await f.connect().placeRecipe.execute(selectionInput(), options("source"));
  assert.equal(source.ok, true);
  const value = {
    entryId: source.value.entryId,
    sourceWeekStart: week,
    targetWeekStart: "2030-01-14",
    expectedSourceRevision: "1",
    expectedTargetRevision: "0",
    date: "2030-01-15",
    slot: "lunch",
  };
  const tools = f.connect(true);
  assert.deepEqual(await tools.placeLeftovers.execute(value, options("leftovers")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.placeLeftovers.execute(value, options("another")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_leftover_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  assert.deepEqual(await f.connect(true).placeLeftovers.execute(value, options("leftovers")), {
    ok: true,
    value: receipt,
  });
  assert.equal(receipt.sourceRevision, "1");
  assert.equal(receipt.targetRevision, "1");
  const target = {
    weekStart: receipt.targetWeekStart,
    entryId: receipt.entryId,
    revision: receipt.targetRevision,
  };
  const detail = await f.connect().readPlannedRecipe.execute(target, options("detail"));
  assert.equal(detail.value.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.equal(
    (
      await f
        .connect(false, f.remote.partnerBearer)
        .readPlannedRecipe.execute(target, options("partner"))
    ).ok,
    true,
  );
  assert.deepEqual(
    await f
      .connect(false, f.remote.partnerBearer)
      .placeLeftovers.execute(value, options("leftovers")),
    { ok: false, code: "forbidden" },
  );
  const stale = f.connect();
  assert.deepEqual(await stale.placeLeftovers.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(
    await stale.placeLeftovers.execute(
      { ...value, expectedTargetRevision: "1", date: "2030-01-16" },
      options("after-conflict"),
    ),
    { ok: false, code: "unavailable" },
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await f.connect().placeLeftovers.execute(value, options("leftovers")), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "1");
});
