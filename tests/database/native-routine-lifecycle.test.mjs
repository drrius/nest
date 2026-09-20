import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/routine-edit-fixture.sql",
  "tests/database/legacy-routine-edits/lifecycle.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
  "supabase/migrations/20260920093203_native_routine_editing.sql",
  "supabase/migrations/20260920101012_native_routine_lifecycle.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let sequence = 500;
const create = () =>
  JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(sequence++)}', '{"title":"Clean","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`,
      ),
    ),
  );
const command = (r, op, action) =>
  `select public.nest_set_routine_state('${id(10)}','${op}','${r.routineId}','${r.version}','${action}')`;
const change = (r, op, action, actor) => JSON.parse(db.sql(as(command(r, op, action), actor)));

test("lifecycle exact retry never undoes a later partner resume and binds actor/action/version", () => {
  const r = create(),
    op = id(sequence++),
    paused = change(r, op, "pause");
  const resumed = change(paused, op, "resume", id(2));
  assert.equal(resumed.actorId, id(2));
  assert.deepEqual(change(r, op, "pause"), paused);
  assert.equal(
    db.sql(`select paused_at is null from public.routines where id='${r.routineId}'`),
    "t",
  );
  assert.throws(() => change(r, op, "archive"), /operation changed/);
  assert.throws(() => change(r, id(sequence++), "pause"), /Routine changed/);
  assert.throws(() => change(r, op, "pause", id(3)), /Not authorized/);
  assert.equal(db.sql(as("select count(*) from public.nest_routine_state_receipts", id(3))), "0");
  assert.throws(
    () => db.sql(as("delete from public.nest_routine_state_receipts")),
    /permission denied/,
  );
  const archived = change(resumed, id(sequence++), "archive");
  assert.equal(archived.action, "archive");
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences where routine_id='${r.routineId}'`),
    "1",
  );
  assert.throws(() => change(archived, id(sequence++), "resume"), /archived routines/);
});

test("concurrent duplicate lifecycle writes commit one activity and receipt", async () => {
  const r = create(),
    op = id(sequence++);
  const values = await Promise.all(
    Array.from({ length: 4 }, () => db.concurrent(as(command(r, op, "pause")))),
  );
  for (const value of values)
    assert.deepEqual(JSON.parse(value.stdout), JSON.parse(values[0].stdout));
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind='routine_paused'`,
    ),
    "1",
  );
});

test("failed lifecycle receipt rolls back archival and revoked membership blocks replay", () => {
  const r = create(),
    op = id(sequence++);
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    values('${r.routineId}','${id(10)}','${id(2)}',true);
    select private.create_reminder_candidates_for_occurrence(id) from public.routine_occurrences where routine_id='${r.routineId}'`);
  const tables = [
    "public.routines",
    "public.routine_occurrences",
    "public.activity_events",
    "public.reminder_candidates",
    "public.nest_routine_state_receipts",
  ];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`,
      ),
    );
  const before = snapshot();
  db.sql(`create function private.fixture_fail_state_receipt() returns trigger language plpgsql as $$ begin raise exception 'fixture receipt failure'; end $$;
    create trigger fixture_fail_state_receipt before insert on public.nest_routine_state_receipts for each row execute function private.fixture_fail_state_receipt()`);
  try {
    assert.throws(() => change(r, op, "archive"), /fixture receipt failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    db.sql(
      "drop trigger fixture_fail_state_receipt on public.nest_routine_state_receipts; drop function private.fixture_fail_state_receipt()",
    );
  }
  change(r, op, "archive");
  assert.throws(
    () =>
      db.sql(`begin; delete from public.activity_events;
    delete from public.household_members where user_id='${id(1)}'; ${as(command(r, op, "archive"))}; commit`),
    /Not authorized/,
  );
});

test("concurrent lifecycle and edits on one baseline have one winner without deadlocks", async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = create(),
      action = attempt % 2 ? "archive" : "pause";
    const results = await Promise.allSettled([
      db.concurrent(as(command(r, id(sequence++), action))),
      db.concurrent(
        as(
          `select public.nest_edit_routine('${id(10)}','${id(sequence++)}','${r.routineId}','${r.version}','{"title":"Concurrent edit"}')`,
          id(2),
        ),
      ),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.match(String(rejected.reason), /changed|could not obtain lock/);
    assert.doesNotMatch(String(rejected.reason), /deadlock/);
    assert.equal(
      db.sql(
        `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind<>'routine_created'`,
      ),
      "1",
    );
    const archived =
      db.sql(`select archived_at is not null from public.routines where id='${r.routineId}'`) ===
      "t";
    assert.equal(
      db.sql(`select count(*) from public.routine_occurrences where routine_id='${r.routineId}'`),
      archived ? "1" : "2",
    );
  }
});

test("lifecycle rejects invalid actions, noncanonical baselines and unprivileged callers", () => {
  const r = create();
  for (const action of ["delete", "PAUSE", "pause\n", ""])
    assert.throws(() => change(r, id(sequence++), action), /Invalid routine state/);
  for (const version of [
    r.version + "\n",
    r.version.replace("Z", "+00:00"),
    "2026-02-30T00:00:00.000000Z",
  ])
    assert.throws(
      () => change({ ...r, version }, id(sequence++), "pause"),
      /Invalid routine version/,
    );
  assert.throws(
    () => change({ ...r, routineId: id(99999) }, id(sequence++), "pause"),
    /Not authorized/,
  );
  assert.throws(
    () => db.sql(`set role anon; ${command(r, id(sequence++), "pause")}`),
    /permission denied/,
  );
  assert.equal(
    db.sql(
      `select paused_at is null and archived_at is null from public.routines where id='${r.routineId}'`,
    ),
    "t",
  );
  const unchanged = change(r, id(sequence++), "resume");
  assert.equal(unchanged.version, r.version);
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind='routine_unpaused'`,
    ),
    "0",
  );
});

test("resuming a dormant legacy schedule with overflowing dates leaves it paused", () => {
  const r = create();
  db.sql(`update public.routines set paused_at=now(),schedule_kind='after_completion',
    schedule_rule='{"kind":"after_completion","every":2147483647,"unit":"weeks"}' where id='${r.routineId}';
    delete from public.routine_occurrences where routine_id='${r.routineId}'`);
  r.version = db.sql(
    `select to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.routines where id='${r.routineId}'`,
  );
  assert.throws(() => change(r, id(sequence++), "resume"), /supported range/);
  assert.equal(
    db.sql(`select paused_at is not null from public.routines where id='${r.routineId}'`),
    "t",
  );
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences where routine_id='${r.routineId}'`),
    "0",
  );
});
