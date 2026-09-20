import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { aiRoutineFiles } from "./ai-routine-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of aiRoutineFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const input = {
  definition: {
    title: "Water plants",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  },
};
let sequence = 1000;
function start() {
  const conversation = id(sequence++),
    turn = id(sequence++);
  const message = {
    id: turn,
    role: "user",
    parts: [{ type: "text", text: "Create a daily watering routine" }],
  };
  const claim = JSON.parse(
    db.sql(
      as(
        `select public.nest_begin_ai_turn('${id(10)}','${conversation}','${turn}',0,${json(message)})`,
      ),
    ),
  );
  return { conversation, turn, claim };
}
const command = (r, value = input, call = "create") =>
  `select public.nest_execute_ai_command('${id(10)}','${r.conversation}','${r.turn}','${call}','createRoutine',${json(value)})`;
const execute = (r, value, call) => JSON.parse(db.sql(as(command(r, value, call))));
test("AI creation replay commits one actual routine with current and preview occurrences", async () => {
  const r = start();
  const results = await Promise.all(Array.from({ length: 4 }, () => db.concurrent(as(command(r)))));
  const values = results.map((result) => JSON.parse(result.stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  const saved = values[0];
  assert.equal(saved.ok, true);
  assert.equal(saved.value.actorId, id(1));
  assert.equal(saved.value.householdId, id(10));
  assert.equal(saved.value.action, "create");
  const routine = saved.value.routineId;
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences where routine_id='${routine}'`),
    "2",
  );
  db.sql(`update public.routines set title='Partner revision' where id='${routine}'`);
  assert.deepEqual(execute(r), saved);
  assert.equal(
    db.sql(`select title from public.routines where id='${routine}'`),
    "Partner revision",
  );
  assert.throws(
    () => execute(r, { definition: { ...input.definition, title: "Changed replay" } }),
    /command changed/,
  );
  for (const actor of [id(2), id(3)]) {
    assert.throws(() => db.sql(as(command(r), actor)), /Not authorized/);
    assert.equal(
      db.sql(
        as(
          `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
          actor,
        ),
      ),
      "0",
    );
  }
});
test("AI routine rejects injected identity, invalid schedule and another household assignee atomically", () => {
  const r = start();
  for (const value of [
    null,
    [],
    { ...input, operationId: id(900) },
    { definition: { ...input.definition, assignment: { policy: "assigned", memberId: id(3) } } },
    { definition: { ...input.definition, schedule: { kind: "weekdays", days: [] } } },
  ]) {
    assert.throws(() => execute(r, value), /Invalid|Not authorized/);
  }
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "0",
  );
});
test("journal failure rolls back routine, native receipt and occurrences", () => {
  const r = start();
  const before = db.sql("select count(*) from public.routines");
  db.sql(
    "create function private.fixture_fail_routine_journal() returns trigger language plpgsql as $$ begin raise exception 'fixture journal failure'; end $$; create trigger fixture_routine_journal before insert on public.nest_ai_commands for each row execute function private.fixture_fail_routine_journal()",
  );
  try {
    assert.throws(() => execute(r), /fixture journal failure/);
  } finally {
    db.sql(
      "drop trigger fixture_routine_journal on public.nest_ai_commands; drop function private.fixture_fail_routine_journal()",
    );
  }
  assert.equal(db.sql("select count(*) from public.routines"), before);
  assert.equal(execute(r).ok, true);
});

test("interrupted transcript recovery replaces forged routine output with the committed journal fact", () => {
  const r = start(),
    saved = execute(r);
  const forged = {
    id: r.claim.assistantId,
    role: "assistant",
    parts: [
      {
        type: "tool-createRoutine",
        toolCallId: "invented",
        state: "output-available",
        input,
        output: { ok: true, value: { routineId: id(999) } },
      },
    ],
  };
  db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${r.conversation}','${r.turn}','interrupted',${json(forged)})`,
    ),
  );
  const history = JSON.parse(
    db.sql(`select transcript from public.nest_ai_conversations where id='${r.conversation}'`),
  );
  const parts = history.at(-1).parts.filter((part) => part.type === "tool-createRoutine");
  assert.equal(parts.length, 1);
  assert.equal(parts[0].toolCallId, "create");
  assert.deepEqual(parts[0].output, saved);
  assert.deepEqual(execute(r), saved);
});
test("revoked membership blocks routine replay and new writes even within a valid private turn", () => {
  const r = start();
  execute(r);
  db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  try {
    assert.throws(() => execute(r), /Not authorized/);
    assert.throws(() => execute(r, input, "another"), /Not authorized/);
    assert.equal(db.sql(as("select count(*) from public.nest_routine_creation_receipts")), "0");
  } finally {
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','Fixture')`,
    );
  }
});
