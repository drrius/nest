import assert from "node:assert/strict";
import { after, test } from "node:test";
import { aiRoutineFiles } from "./ai-routine-files.mjs";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  ...aiRoutineFiles,
  "supabase/migrations/20260926094530_native_ai_turn_nonretryable_conflicts.sql",
  "supabase/migrations/20260928113028_native_ai_unstarted_cancellation.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  db.sql(`set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`);
const cancel = (conversation, operation) =>
  `select public.nest_cancel_unstarted_ai_turn('${id(10)}','${id(conversation)}','${id(operation)}')`;
const begin = (conversation, operation) =>
  `select public.nest_begin_ai_turn('${id(10)}','${id(conversation)}','${id(operation)}',0,'${JSON.stringify({ id: id(operation), role: "user", parts: [{ type: "text", text: "Hello" }] })}'::jsonb)`;
test("cancelled identity stays cancelled while another operation can begin", () => {
  assert.equal(JSON.parse(as(1, cancel(100, 101))).cancelled, true);
  assert.equal(JSON.parse(as(1, cancel(100, 101))).cancelled, true);
  assert.throws(() => as(1, begin(100, 101)), /AI turn cancelled/);
  assert.equal(JSON.parse(as(1, begin(100, 102))).claimed, true);
  assert.equal(JSON.parse(as(1, cancel(100, 102))).cancelled, false);
});
test("partner, outsider and anonymous cannot cancel another private conversation", () => {
  for (const actor of [2, 3]) assert.throws(() => as(actor, cancel(100, 103)), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${cancel(100, 103)}`), /permission denied/);
  assert.throws(() => as(1, "select * from private.nest_ai_cancelled_turns"), /permission denied/);
});

test("concurrent cancellation wins before delayed begin without appending a prompt", async () => {
  const first = db.concurrent(`begin; set application_name='cancel-first'; set role authenticated;
    set request.jwt.claim.sub='${id(1)}'; ${cancel(200, 201)}; select pg_sleep(0.4); commit;`);
  let locked = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (
      db.sql(
        "select count(*) from pg_stat_activity where application_name='cancel-first' and wait_event='PgSleep'",
      ) === "1"
    ) {
      locked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(locked, true);
  await assert.rejects(
    db.concurrent(
      `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${begin(200, 201)}`,
    ),
    /AI turn cancelled/,
  );
  await first;
  assert.equal(
    db.sql(
      `select jsonb_array_length(transcript) from public.nest_ai_conversations where id='${id(200)}'`,
    ),
    "0",
  );
});

test("concurrent begin wins and cancellation cannot hide its running turn", async () => {
  const first = db.concurrent(`begin; set application_name='begin-first'; set role authenticated;
    set request.jwt.claim.sub='${id(1)}'; ${begin(300, 301)}; select pg_sleep(0.4); commit;`);
  let locked = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (
      db.sql(
        "select count(*) from pg_stat_activity where application_name='begin-first' and wait_event='PgSleep'",
      ) === "1"
    ) {
      locked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(locked, true);
  const result = await db.concurrent(
    `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${cancel(300, 301)}`,
  );
  await first;
  assert.equal(JSON.parse(result.stdout.trim()).cancelled, false);
  assert.equal(
    db.sql(`select state from public.nest_ai_turns where conversation_id='${id(300)}'`),
    "running",
  );
  assert.equal(
    db.sql(
      `select count(*) from private.nest_ai_cancelled_turns where conversation_id='${id(300)}'`,
    ),
    "0",
  );
});
