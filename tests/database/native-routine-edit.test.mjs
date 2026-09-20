import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/routine-edit-fixture.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
  "supabase/migrations/20260920093203_native_routine_editing.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let sequence = 100;
const create = () =>
  JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(sequence++)}',${json({ title: "Clean", schedule: { kind: "daily" }, assignment: { policy: "shared" } })})`,
      ),
    ),
  );
const command = (r, op, patch) =>
  `select public.nest_edit_routine('${id(10)}','${op}','${r.routineId}','${r.version}',${json(patch)})`;
const edit = (r, op, patch, actor) => JSON.parse(db.sql(as(command(r, op, patch), actor)));
test("native edit receipts bind actor and payload, preserve legacy title, and replay without undoing later edits", () => {
  const r = create();
  db.sql(
    `update public.routines set title='${"🧹".repeat(120)}',instructions='Retained instructions' where id='${r.routineId}'`,
  );
  r.version = db.sql(
    `select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.routines where id='${r.routineId}'`,
  );
  const op = id(sequence++),
    patch = { schedule: { kind: "weekly", weekday: 2 } };
  const result = edit(r, op, patch);
  assert.equal(result.actorId, id(1));
  assert.equal(result.action, "edit");
  assert.equal(
    db.sql(`select title from public.routines where id='${r.routineId}'`),
    "🧹".repeat(120),
  );
  assert.equal(
    db.sql(`select instructions from public.routines where id='${r.routineId}'`),
    "Retained instructions",
  );
  const partner = edit({ ...r, version: result.version }, op, { title: "Partner title" }, id(2));
  assert.equal(partner.actorId, id(2));
  assert.deepEqual(edit(r, op, patch), result);
  assert.equal(
    db.sql(`select title from public.routines where id='${r.routineId}'`),
    "Partner title",
  );
  assert.throws(() => edit(r, op, { title: "Changed retry" }), /operation changed/);
  assert.throws(() => edit(r, id(sequence++), { title: "Stale" }), /changed/);
  assert.equal(db.sql(as("select count(*) from public.nest_routine_edit_receipts")), "1");
  assert.equal(db.sql(as("select count(*) from public.nest_routine_edit_receipts", id(3))), "0");
});
test("native edit rejects hidden fields, invalid patches, foreign callers and unusable intervals", () => {
  const r = create();
  for (const patch of [
    {},
    { title: null },
    { instructions: "hidden" },
    { assignment: { policy: "assigned", memberId: id(3) } },
    { schedule: { kind: "after_completion", every: 2147483647, unit: "weeks" } },
  ])
    assert.throws(() => edit(r, id(sequence++), patch), /Invalid|supported range/);
  assert.throws(() => edit(r, id(sequence++), { title: "Foreign" }, id(3)), /Not authorized/);
  assert.equal(db.sql(`select title from public.routines where id='${r.routineId}'`), "Clean");
});
test("concurrent duplicate native edits create one receipt and one activity", async () => {
  const r = create(),
    op = id(sequence++);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => db.concurrent(as(command(r, op, { title: "Once" })))),
  );
  const values = results.map((r) => JSON.parse(r.stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind='routine_updated'`,
    ),
    "1",
  );
});

test("receipt failure rolls back definition, occurrence rebuild, notices and both receipts", () => {
  const r = create(),
    op = id(sequence++);
  const tables = [
    "public.routines",
    "public.routine_occurrences",
    "public.activity_events",
    "public.inbox_notifications",
    "public.push_outbox",
    "private.routine_edit_receipts",
    "public.nest_routine_edit_receipts",
  ];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`,
      ),
    );
  const before = snapshot();
  const patch = {
    schedule: { kind: "weekly", weekday: 4 },
    assignment: { policy: "assigned", memberId: id(2) },
  };
  db.sql(`create function private.fixture_edit_receipt_failure() returns trigger language plpgsql as $$
    begin raise exception 'fixture edit receipt failure'; end $$;
    create trigger fixture_edit_receipt_failure before insert on public.nest_routine_edit_receipts
    for each row execute function private.fixture_edit_receipt_failure()`);
  try {
    assert.throws(() => edit(r, op, patch), /fixture edit receipt failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    db.sql(`drop trigger fixture_edit_receipt_failure on public.nest_routine_edit_receipts;
      drop function private.fixture_edit_receipt_failure()`);
  }
  assert.equal(edit(r, op, patch).action, "edit");
});

test("revocation prevents receipt replay and direct writes cannot bypass the command", () => {
  const r = create(),
    op = id(sequence++),
    patch = { title: "Saved before revocation" };
  edit(r, op, patch);
  // Rollback-only administrative revocation; fixture foreign-key dependencies are removed first.
  assert.throws(
    () =>
      db.sql(`begin;
    delete from public.push_outbox; delete from public.inbox_notifications;
    delete from public.activity_events;
    delete from public.household_members where user_id='${id(1)}';
    ${as(command(r, op, patch))}; commit`),
    /Not authorized/,
  );
  for (const sql of [
    "delete from public.nest_routine_edit_receipts",
    "update public.routines set title='Bypass'",
    "select * from private.routine_edit_receipts",
    "select private.nest_routine_edit_patch('{}',null)",
  ])
    assert.throws(() => db.sql(as(sql)), /permission denied/);
  assert.throws(() => db.sql(`set role anon; ${command(r, op, patch)}`), /permission denied/);
});

test("version parsing rejects noncanonical and normalized timestamps before edits", () => {
  const r = create();
  for (const version of [
    r.version + "\n",
    r.version.replace("Z", "+00:00"),
    "2026-02-30T00:00:00.000000Z",
    "2026-01-01T24:00:00.000000Z",
    "0000-01-01T00:00:00.000000Z",
    "2026-01-01T00:00:00.123Z",
  ])
    assert.throws(
      () => edit({ ...r, version }, id(sequence++), { title: "Invalid" }),
      /Invalid routine version/,
    );
  assert.equal(db.sql(`select title from public.routines where id='${r.routineId}'`), "Clean");
});
