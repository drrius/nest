import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { completionClosureFiles } from "./completion-closure-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  ...completionClosureFiles,
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920091316_native_ai_routine_creation.sql",
  "supabase/migrations/20260920100014_native_ai_routine_editing.sql",
  "supabase/migrations/20260920103624_native_ai_routine_lifecycle.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql) => `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${sql}`;
test("AI completion journals a lock conflict and exact replay cannot become a later completion", async () => {
  const routine = JSON.parse(
    db.sql(
      as(`select public.nest_create_routine('${id(10)}','${id(100)}',
    '{"title":"AI lock","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`),
    ),
  );
  const current = JSON.parse(
    db.sql(
      `select row_to_json(o) from public.routine_occurrences o where routine_id='${routine.routineId}' and role='current'`,
    ),
  );
  const message = { id: id(102), role: "user", parts: [{ type: "text", text: "Complete chore" }] };
  db.sql(
    as(
      `select public.nest_begin_ai_turn('${id(10)}','${id(101)}','${id(102)}',0,'${JSON.stringify(message)}')`,
    ),
  );
  const input = {
    occurrenceId: current.id,
    expectedDueDate: current.due_date,
    completedOn: current.due_date,
  };
  const command = as(
    `select public.nest_execute_ai_command('${id(10)}','${id(101)}','${id(102)}','complete','completeChore','${JSON.stringify(input)}')`,
  );
  const blocker = db.concurrent(`begin; set application_name='nest-ai-completion-lock';
    select id from public.routines where id='${routine.routineId}' for update; select pg_sleep(1.5); commit`);
  try {
    for (let attempt = 0; ; attempt++) {
      if (
        db.sql(
          "select count(*) from pg_stat_activity where application_name='nest-ai-completion-lock' and wait_event='PgSleep'",
        ) === "1"
      )
        break;
      assert.ok(attempt < 100, "routine lock holder did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.deepEqual(JSON.parse(db.sql(command)), { ok: false, code: "conflict" });
  } finally {
    await blocker;
  }
  assert.equal(
    db.sql(`select count(*) from public.nest_ai_commands where conversation_id='${id(101)}'`),
    "1",
  );
  assert.deepEqual(JSON.parse(db.sql(command)), { ok: false, code: "conflict" });
  assert.equal(
    db.sql(`select count(*) from public.routine_completions where occurrence_id='${current.id}'`),
    "0",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.nest_chore_receipts where result->>'occurrenceId'='${current.id}'`,
    ),
    "0",
  );
});
