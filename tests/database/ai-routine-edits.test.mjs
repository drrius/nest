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
