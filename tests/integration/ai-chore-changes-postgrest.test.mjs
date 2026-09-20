import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiChoreChangeFiles } from "../database/ai-chore-change-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(t) {
  const remote = await postgrestFixture(t, [
    ...aiChoreChangeFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const as = (sql, actor = id(1)) =>
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: actor })}'; ${sql}`;
  const definition = {
    title: "SDK chore",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  };
  const routine = JSON.parse(
    remote.db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(800)}','${JSON.stringify(definition)}')`,
      ),
    ),
  );
  const input = JSON.parse(
    remote.db
      .sql(`select jsonb_build_object('occurrenceId',id,'expectedDueDate',due_date::text,'newDueDate',(due_date+1)::text)
    from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`),
  );
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Change my chore",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(
    as(
      `select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`,
    ),
  );
  const config = { url: proxy.url, publishableKey: "sb_publishable_fixture" };
  const connect = (bearer = remote.bearer) =>
    householdTools(
      new Request("http://localhost/", {
        headers: { authorization: `Bearer ${bearer}` },
      }),
      config,
      { householdId: id(10), turn },
    ).tools;
  return { remote, proxy, as, routine, input, connect };
}
test("actual SDK reschedule tool recovers a journaled response after partner rebuild and refuses private-turn access", async (t) => {
  const f = await setup(t),
    options = { toolCallId: "change", messages: [] };
  const tools = f.connect();
  assert.deepEqual(await tools.rescheduleChore.execute(f.input, options), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  const skip = { occurrenceId: f.input.occurrenceId, expectedDueDate: f.input.expectedDueDate };
  assert.deepEqual(await tools.skipChore.execute(skip, { ...options, toolCallId: "replacement" }), {
    ok: false,
    code: "unavailable",
  });
  f.remote.db.sql(
    f.as(
      `select public.nest_edit_routine('${id(10)}','${id(802)}','${f.routine.routineId}',
    '${f.routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`,
      id(2),
    ),
  );
  const saved = await f.connect().rescheduleChore.execute(f.input, options);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.dueDate, f.input.newDueDate);
  assert.equal(
    f.remote.db.sql(
      `select count(*) from public.routine_occurrences where id='${f.input.occurrenceId}'`,
    ),
    "0",
  );
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_chore_change_receipts"), "1");
  assert.deepEqual(
    await f.connect(f.remote.partnerBearer).rescheduleChore.execute(f.input, options),
    { ok: false, code: "forbidden" },
  );
  assert.deepEqual(
    await f.connect(f.remote.otherBearer).rescheduleChore.execute(f.input, options),
    { ok: false, code: "forbidden" },
  );
});
test("actual SDK skip tool commits once and canonical retry acknowledges the original skipped occurrence", async (t) => {
  const f = await setup(t),
    options = { toolCallId: "skip", messages: [] };
  const input = { occurrenceId: f.input.occurrenceId, expectedDueDate: f.input.expectedDueDate };
  assert.deepEqual(await f.connect().skipChore.execute(input, options), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  const result = await f.connect().skipChore.execute(input, options);
  assert.equal(result.ok, true);
  assert.equal(result.value.occurrenceId, input.occurrenceId);
  assert.equal(result.value.status, "skipped");
  const current = JSON.parse(
    f.remote.db.sql(
      "select jsonb_build_object('id',id,'date',due_date) from public.routine_occurrences where role='current'",
    ),
  );
  assert.notEqual(current.id, input.occurrenceId);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.remote.db.sql("select count(*) from public.routine_completions"), "0");
});
