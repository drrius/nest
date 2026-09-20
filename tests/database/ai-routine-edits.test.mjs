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
const command = (r, value, call = "edit") =>
  `select public.nest_execute_ai_command('${id(10)}','${r.conversation}','${r.turn}','${call}','editRoutine',${json(value)})`;
const execute = (r, value, call) => JSON.parse(db.sql(as(command(r, value, call))));
const create = () =>
  JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(sequence++)}',${json(input.definition)})`,
      ),
    ),
  );
const editInput = (routine) => ({
  routineId: routine.routineId,
  expectedVersion: routine.version,
  patch: { title: "AI edited" },
});

test("AI edit commits once, replays after partner work and isolates private receipts", async () => {
  const r = start(),
    routine = create(),
    value = editInput(routine);
  const results = await Promise.all(
    Array.from({ length: 3 }, () => db.concurrent(as(command(r, value)))),
  );
  const saved = JSON.parse(results[0].stdout);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.action, "edit");
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  db.sql(`update public.routines set title='Later partner work' where id='${routine.routineId}'`);
  assert.deepEqual(execute(r, value), saved);
  assert.equal(
    db.sql(`select title from public.routines where id='${routine.routineId}'`),
    "Later partner work",
  );
  assert.throws(
    () => execute(r, { ...value, patch: { title: "Altered retry" } }),
    /command changed/,
  );
  for (const actor of [id(2), id(3)])
    assert.throws(() => db.sql(as(command(r, value), actor)), /Not authorized/);
});

test("AI stale and archived edits persist conflict results without changing routine history", () => {
  const r = start(),
    routine = create(),
    value = editInput(routine);
  db.sql(`update public.routines set archived_at=now() where id='${routine.routineId}'`);
  assert.deepEqual(execute(r, value), { ok: false, code: "conflict" });
  value.expectedVersion = db.sql(
    `select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.routines where id='${routine.routineId}'`,
  );
  assert.deepEqual(execute(r, value, "archived"), { ok: false, code: "conflict" });
  db.sql(`update public.routines set archived_at=null where id='${routine.routineId}'`);
  assert.deepEqual(execute(r, value, "archived"), { ok: false, code: "conflict" });
  assert.equal(
    db.sql(
      `select count(*) from public.nest_routine_edit_receipts where result->>'routineId'='${routine.routineId}'`,
    ),
    "0",
  );
});

test("AI edit rejects extra identity, malformed baselines and hidden patch fields before journaling", () => {
  const r = start(),
    routine = create(),
    value = editInput(routine);
  for (const change of [
    { actorId: id(2) },
    { routineId: null },
    { routineId: id(100) + "\n" },
    { expectedVersion: value.expectedVersion + "\n" },
    { patch: {} },
    { patch: { instructions: "hidden" } },
  ])
    assert.throws(() => execute(r, { ...value, ...change }), /Invalid/);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "0",
  );
});

test("failed AI edit journal insertion rolls back definition, occurrences, notices and native receipt", () => {
  const r = start(),
    routine = create(),
    value = editInput(routine);
  value.patch = {
    schedule: { kind: "weekly", weekday: 4 },
    assignment: { policy: "assigned", memberId: id(2) },
  };
  const tables = [
    "public.routines",
    "public.routine_occurrences",
    "public.activity_events",
    "public.inbox_notifications",
    "public.push_outbox",
    "public.nest_routine_edit_receipts",
    "private.routine_edit_receipts",
    "public.nest_ai_commands",
  ];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`,
      ),
    );
  const before = snapshot();
  db.sql(`create function private.fixture_fail_ai_edit() returns trigger language plpgsql as $$
    begin raise exception 'fixture edit journal failure'; end $$;
    create trigger fixture_fail_ai_edit before insert on public.nest_ai_commands
    for each row execute function private.fixture_fail_ai_edit()`);
  try {
    assert.throws(() => execute(r, value), /fixture edit journal failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    db.sql(
      "drop trigger fixture_fail_ai_edit on public.nest_ai_commands; drop function private.fixture_fail_ai_edit()",
    );
  }
  assert.equal(execute(r, value).ok, true);
});

test("AI edit recovery removes invented output and revoked callers cannot replay it", () => {
  const r = start(),
    routine = create(),
    value = editInput(routine),
    saved = execute(r, value);
  const forged = {
    id: r.claim.assistantId,
    role: "assistant",
    parts: [
      {
        type: "tool-editRoutine",
        toolCallId: "invented",
        state: "output-available",
        input: value,
        output: { ok: true, value: { ...saved.value, routineId: id(999) } },
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
  const parts = history.at(-1).parts.filter((part) => part.type === "tool-editRoutine");
  assert.equal(parts.length, 1);
  assert.equal(parts[0].toolCallId, "edit");
  assert.deepEqual(parts[0].output, saved);
  assert.deepEqual(execute(r, value), saved);
  assert.throws(
    () =>
      db.sql(`begin; delete from public.push_outbox; delete from public.inbox_notifications;
    delete from public.activity_events; delete from public.household_members where user_id='${id(1)}';
    ${as(command(r, value))}; commit`),
    /Not authorized/,
  );
});
