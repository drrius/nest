import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiRoutineFiles } from "../database/ai-routine-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  definition: {
    title: "Water plants",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  },
};
test("actual SDK tool execution recovers journaled routine lifecycle through PostgREST after lost response", async (t) => {
  const remote = await postgrestFixture(t, [
    ...aiRoutineFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const created = JSON.parse(
    remote.db.sql(
      `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_create_routine('${id(10)}','${id(800)}','${JSON.stringify(input.definition)}')`,
    ),
  );
  const state = {
    routineId: created.routineId,
    expectedVersion: created.version,
    action: "pause",
  };
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Create routine",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`,
  );
  const config = { url: proxy.url, publishableKey: "sb_publishable_fixture" };
  const request = (bearer) =>
    new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } });
  const connect = (bearer = remote.bearer) =>
    householdTools(request(bearer), config, { householdId: id(10), turn }).tools;
  const options = { toolCallId: "create", messages: [] };
  const tools = connect();
  assert.deepEqual(await tools.setRoutineState.execute(state, options), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(proxy.dropped(), 1);
  assert.equal(remote.db.sql("select count(*) from public.routines"), "1");
  // Unknown write halts this run. Recovery uses a fresh executor with the same persisted call identity.
  assert.deepEqual(await tools.setRoutineState.execute(state, options), {
    ok: false,
    code: "unavailable",
  });
  remote.db.sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(2) })}';
    select public.nest_set_routine_state('${id(10)}','${id(802)}','${created.routineId}',
      (select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.routines),'resume')`);
  const recovered = await connect().setRoutineState.execute(state, options);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value.action, "pause");
  assert.equal(remote.db.sql("select count(*) from public.routines"), "1");
  assert.equal(remote.db.sql("select count(*) from public.routine_occurrences"), "2");
  assert.equal(remote.db.sql("select paused_at is null from public.routines"), "t");
  const partner = connect(remote.partnerBearer);
  const list = await partner.readRoutines.execute({}, { ...options, toolCallId: "read" });
  assert.equal(list.ok, true);
  assert.equal(list.value.routines[0].routineId, recovered.value.routineId);
  assert.equal(list.value.members.length, 2);
  assert.deepEqual(await partner.setRoutineState.execute(state, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await connect(remote.otherBearer).readRoutines.execute({}, options), {
    ok: false,
    code: "forbidden",
  });
});
