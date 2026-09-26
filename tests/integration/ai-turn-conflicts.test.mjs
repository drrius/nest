import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { aiRoutineFiles } from "../database/ai-routine-files.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = "supabase/migrations/20260926094530_native_ai_turn_nonretryable_conflicts.sql";
const identity = { p_household: id(10), p_conversation: id(900) };
const begin = (n, expected = 0) => ({
  p_operation: id(n),
  p_expected: expected,
  p_message: { id: id(n), role: "user", parts: [{ type: "text", text: "Test" }] },
});

async function fixture(t) {
  const f = await postgrestFixture(t, [
    ...aiRoutineFiles,
    "tests/integration/food-postgrest.sql",
    migration,
  ]);
  return {
    ...f,
    rpc: async (name, fields) => {
      const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ ...identity, ...fields }),
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

async function conflict(f, name, fields) {
  const response = await f.rpc(name, fields);
  assert.equal(response.status, 412, JSON.stringify(response));
  assert.equal(response.body.code, "PT412");
}

test("AI ownership and transcript conflicts leave the running turn unchanged", async (t) => {
  const f = await fixture(t);
  const started = await f.rpc("nest_begin_ai_turn", begin(901));
  assert.equal(started.status, 200);
  assert.equal(started.body.claimed, true);
  const snapshot = () => f.db.sql("select to_jsonb(t) from public.nest_ai_conversations t");
  const before = snapshot();
  const replay = await f.rpc("nest_begin_ai_turn", begin(901));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.claimed, false);
  await conflict(f, "nest_begin_ai_turn", begin(902, 1));
  await conflict(f, "nest_save_conversation", {
    p_operation: id(903),
    p_expected: 1,
    p_schema: 1,
    p_transcript: [],
  });
  assert.equal(snapshot(), before);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_turns"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_conversation_saves"), "0");
});

test("expired turns refuse commands and completion but allow exact interruption recovery", async (t) => {
  const f = await fixture(t);
  const started = await f.rpc("nest_begin_ai_turn", begin(901));
  assert.equal(started.status, 200);
  f.db.sql("update public.nest_ai_turns set deadline_at=clock_timestamp()-interval '1 second'");
  await conflict(f, "nest_execute_ai_command", {
    p_turn: id(901),
    p_call: "expired-call",
    p_tool: "addGrocery",
    p_input: { name: "Oats", quantity: null, unit: null, categoryId: null },
  });
  await conflict(f, "nest_finish_ai_turn", {
    p_operation: id(901),
    p_state: "completed",
    p_response: { id: started.body.assistantId, role: "assistant", parts: [] },
  });
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
  const fields = { p_operation: id(901), p_state: "interrupted", p_response: null };
  const recovered = await f.rpc("nest_finish_ai_turn", fields);
  assert.equal(recovered.status, 200);
  assert.deepEqual(await f.rpc("nest_finish_ai_turn", fields), recovered);
  await conflict(f, "nest_begin_ai_turn", begin(902, 0));
  await conflict(f, "nest_save_conversation", {
    p_operation: id(903),
    p_expected: 0,
    p_schema: 1,
    p_transcript: [],
  });
  assert.equal(f.db.sql("select revision from public.nest_ai_conversations"), "2");
});
