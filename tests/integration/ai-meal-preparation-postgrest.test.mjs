import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, week, id, input, seed } from "../database/ai-meal-preparation-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function setup(t) {
  const remote = await postgrestFixture(t, [...files, "tests/integration/food-postgrest.sql"]);
  seed(remote.db);
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

test("SDK preparation reconciles committed response loss and reads completed state privately", async (t) => {
  const f = await setup(t),
    value = input();
  const target = { entryId: value.entryId, weekStart: week, revision: "1" };
  const before = await f.connect().readMealPreparation.execute(target, options("read"));
  assert.equal(before.ok, true);
  assert.equal(before.value.preparation, null);
  const tools = f.connect(true);
  assert.deepEqual(await tools.createMealPreparation.execute(value, options("preparation")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.createMealPreparation.execute(value, options("another")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_preparation_receipts"),
  );
  f.remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(2) })}'; select public.complete_occurrence('${receipt.occurrenceId}','ai-prep-complete','2030-01-06')`,
  );
  assert.deepEqual(
    await f.connect(true).createMealPreparation.execute(value, options("preparation")),
    { ok: true, value: receipt },
  );
  const partner = f.connect(false, f.remote.partnerBearer);
  const detail = await partner.readMealPreparation.execute(target, options("partner-read"));
  assert.equal(detail.ok, true);
  assert.equal(detail.value.preparation.status, "completed");
  assert.deepEqual(await partner.createMealPreparation.execute(value, options("preparation")), {
    ok: false,
    code: "forbidden",
  });
  const stale = f.connect();
  assert.deepEqual(await stale.createMealPreparation.execute(value, options("duplicate")), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(await stale.createMealPreparation.execute(value, options("after-conflict")), {
    ok: false,
    code: "unavailable",
  });
  f.remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.deepEqual(await f.connect().createMealPreparation.execute(value, options("preparation")), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await f.connect().readMealPreparation.execute(target, options("revoked-read")), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
});

test("SDK assigned preparation uses the bounded roster beyond 200 routines", async (t) => {
  const f = await setup(t);
  f.remote.db
    .sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_create_routine('${id(10)}',gen_random_uuid(),jsonb_build_object('title','Task '||n,'schedule',jsonb_build_object('kind','one_off','date','2030-01-07'),'assignment',jsonb_build_object('policy','shared'))) from generate_series(1,201) n`);
  const tools = f.connect();
  assert.deepEqual(await tools.readRoutines.execute({}, options("routines")), {
    ok: false,
    code: "unavailable",
  });
  const roster = await tools.readHouseholdRoster.execute({}, options("roster"));
  assert.equal(roster.ok, true);
  assert.equal(roster.value.householdId, id(10));
  const partner = roster.value.members.find((member) => member.actorId === id(2));
  assert.ok(partner);
  const value = input();
  value.preparation.assignment = { policy: "assigned", memberId: partner.actorId };
  const saved = await tools.createMealPreparation.execute(value, options("assigned"));
  assert.equal(saved.ok, true);
  const detail = await tools.readMealPreparation.execute(
    { entryId: value.entryId, weekStart: week, revision: "1" },
    options("detail"),
  );
  assert.equal(detail.value.preparation.plannedAssigneeId, partner.actorId);
  assert.deepEqual(
    await f
      .connect(false, f.remote.otherBearer)
      .readHouseholdRoster.execute({}, options("foreign")),
    { ok: false, code: "forbidden" },
  );
  f.remote.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.deepEqual(await tools.readHouseholdRoster.execute({}, options("revoked")), {
    ok: false,
    code: "forbidden",
  });
});
