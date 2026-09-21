import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { files, week, id, creationInput, seed } from "../database/ai-preparation-edit-fixture.mjs";
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
    text: "Clear the preparation instructions",
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

async function editedTask(t) {
  const f = await setup(t);
  const created = await f
    .connect()
    .createMealPreparation.execute(creationInput(), options("create"));
  assert.equal(created.ok, true);
  const value = {
    entryId: created.value.entryId,
    weekStart: week,
    expectedRevision: created.value.revision,
    routineId: created.value.routineId,
    expectedRoutineVersion: created.value.routineVersion,
    patch: { instructions: null },
  };
  return { ...f, value };
}

test("SDK preparation edit recovers its private receipt after response loss and partner correction", async (t) => {
  const f = await editedTask(t),
    tools = f.connect(true);
  assert.deepEqual(await tools.editMealPreparation.execute(f.value, options("edit")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.editMealPreparation.execute(f.value, options("different")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_meal_preparation_edit_receipts"),
  );
  const correction = {
    ...f.value,
    expectedRoutineVersion: receipt.routineVersion,
    patch: { title: "Partner correction" },
  };
  f.remote.db
    .sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(2) })}';
    select public.nest_edit_meal_preparation('${id(10)}','${id(821)}','${JSON.stringify(correction)}'::jsonb)`);
  assert.deepEqual(await f.connect(true).editMealPreparation.execute(f.value, options("edit")), {
    ok: true,
    value: receipt,
  });
  const partner = f.connect(false, f.remote.partnerBearer);
  const target = { entryId: f.value.entryId, weekStart: week, revision: receipt.revision };
  const current = await partner.readMealPreparation.execute(target, options("read"));
  assert.equal(current.ok, true);
  assert.equal(current.value.preparation.title, "Partner correction");
  assert.equal(current.value.preparation.instructions, null);
  assert.deepEqual(await partner.editMealPreparation.execute(f.value, options("edit")), {
    ok: false,
    code: "forbidden",
  });
  const stale = f.connect();
  assert.deepEqual(await stale.editMealPreparation.execute(f.value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(await stale.editMealPreparation.execute(f.value, options("after-conflict")), {
    ok: false,
    code: "unavailable",
  });
  f.remote.db.sql(`delete from public.inbox_notifications; delete from public.activity_events;
    delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await f.connect().editMealPreparation.execute(f.value, options("edit")), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await f.connect().readMealPreparation.execute(target, options("revoked")), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(
    f.remote.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"),
    "2",
  );
});
