import { assertPreparedCallerFenced } from "./offline-epoch-prepared-caller.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { completionClosureFiles } from "./completion-closure-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = 1) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;

function fixture(t, adapter = true) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  for (const file of completionClosureFiles) db.file(file);
  for (const file of [
    "20260925185000_native_household_write_barrier.sql",
    "20260925202107_native_offline_cutover_epoch.sql",
    ...(adapter ? ["20260925202807_native_chore_epoch_command.sql"] : []),
  ])
    db.file(`supabase/migrations/${file}`);
  const definition = JSON.stringify({
    title: "Epoch chore",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  });
  db.sql(as(`select public.nest_create_routine('${id(10)}','${id(100)}','${definition}')`));
  const current = JSON.parse(
    db.sql("select row_to_json(o) from public.routine_occurrences o where role='current'"),
  );
  return { db, current };
}

test("chore cutover returns historical completion but rejects unreceived stale commands", (t) => {
  const { db, current } = fixture(t);
  const epoch = db.sql("select offline_epoch from private.nest_household_write_control");
  const command = {
    operationId: id(200),
    occurrenceId: current.id,
    expectedDueDate: current.due_date,
    completedOn: current.due_date,
  };
  const old = (op) => `select public.nest_complete_chore(
    '${current.id}','${id(op)}','${current.due_date}','${current.due_date}')`;
  const request = (value, token) => `select public.nest_complete_chore_at_epoch(
    '${JSON.stringify(value)}'::jsonb,${token ? `'${token}'` : "null"})`;
  const receipt = JSON.parse(db.sql(as(old(200))));
  db.sql("select private.nest_set_household_writes_frozen(true)");
  const rotated = db.sql("select private.nest_rotate_offline_epoch()");
  assert.deepEqual(JSON.parse(db.sql(as(request(command, epoch)))), receipt);
  db.sql("select private.nest_set_household_writes_frozen(false)");
  assert.deepEqual(JSON.parse(db.sql(as(old(200)))), receipt);
  const pending = { ...command, operationId: id(201) };
  for (const sql of [old(201), request(pending, epoch), request(pending, null)])
    assert.throws(() => db.sql(as(sql)), /reconciliation/);
  assert.throws(() => db.sql(as(request(command, epoch), 2)), /reconciliation/);
  assert.throws(() => db.sql(as(request(command, epoch), 3)), /not_found/);
  const recovered = JSON.parse(db.sql(as(request(pending, rotated))));
  assert.equal(recovered.outcome, "already_completed");
  assert.deepEqual(JSON.parse(db.sql(as(request(pending, rotated)))), recovered);
  assert.equal(db.sql("select count(*) from public.routine_completions"), "1");
  assert.equal(db.sql("select count(*) from public.nest_chore_receipts"), "2");
  assert.throws(
    () =>
      db.sql(
        as(`select private.nest_complete_chore_before_epoch(
    '${current.id}','${id(202)}','${current.due_date}','${current.due_date}')`),
      ),
    /permission denied/,
  );
});

test("prepared chore caller retains its OID and cannot bypass the installed epoch adapter", async (t) => {
  const { db, current } = fixture(t, false);
  await assertPreparedCallerFenced(db, {
    signature: "private.nest_complete_chore(uuid,uuid,date,date)",
    statement: `select public.nest_complete_chore('${current.id}',$1,'${current.due_date}','${current.due_date}')`,
    migration: "20260925202807_native_chore_epoch_command.sql",
    ids: [id(300), id(301)],
  });
  assert.equal(db.sql("select count(*) from public.nest_chore_receipts"), "1");
  assert.equal(db.sql("select count(*) from public.routine_completions"), "1");
});
