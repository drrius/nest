import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/routine-creation-fixture.sql");
db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const definition = {
  title: "Clean kitchen",
  schedule: { kind: "daily" },
  assignment: { policy: "shared" },
};
const as = (actor, query) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${query}`;
const command = (value = definition, operation = 100, home = 10) =>
  `select public.nest_create_routine('${id(home)}','${id(operation)}','${JSON.stringify(value).replaceAll("'", "''")}'::jsonb)`;
const save = (value, operation, actor = 1, home = 10) =>
  JSON.parse(db.sql(as(actor, command(value, operation, home))));
beforeEach(() =>
  db.sql(
    "truncate public.nest_routine_creation_receipts,public.activity_events,public.routines cascade",
  ),
);

test("shared creation writes a current and preview once without assigning or enabling reminders", () => {
  const first = save();
  assert.equal(first.actorId, id(1));
  assert.equal(first.householdId, id(10));
  assert.equal(first.action, "create");
  assert.match(first.version, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  assert.deepEqual(save(), first);
  assert.equal(db.sql("select count(*) from public.routines"), "1");
  assert.equal(
    db.sql("select count(*) from public.routine_occurrences where planned_assignee_id is null"),
    "2",
  );
  assert.equal(db.sql("select count(*) from public.activity_events"), "1");
  assert.equal(db.sql("select count(*) from public.routine_reminder_preferences"), "0");
  assert.equal(db.sql("select count(*) from public.reminder_candidates"), "0");
  assert.equal(
    db.sql("select string_agg(role,',' order by role) from public.routine_occurrences"),
    "current,preview",
  );
});

test("creation and receipt reads enforce actor and household isolation", () => {
  save();
  assert.throws(() => save(undefined, 101, 3), /Not authorized/);
  assert.throws(() => save(undefined, 101, 1, 20), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${command()}`), /permission denied/);
  assert.equal(db.sql(as(2, "select count(*) from public.nest_routine_creation_receipts")), "0");
  assert.equal(db.sql(as(3, "select count(*) from public.routines")), "0");
  assert.equal(db.sql(as(3, "select count(*) from public.routine_occurrences")), "0");
  assert.throws(() => db.sql(as(1, "delete from public.routines")), /permission denied/);
  assert.throws(
    () => db.sql(as(1, "delete from public.nest_routine_creation_receipts")),
    /permission denied/,
  );
});

test("same UUID is isolated between actors and changed retries cannot create another routine", () => {
  const first = save();
  assert.throws(() => save({ ...definition, title: "Changed" }), /operation changed/);
  const second = save(undefined, 100, 2);
  assert.notEqual(first.routineId, second.routineId);
  db.sql(
    `update public.routines set title='Newer title',updated_at=updated_at+interval '1 second' where id='${first.routineId}'`,
  );
  assert.deepEqual(save(), first);
  assert.equal(
    db.sql(`select title from public.routines where id='${first.routineId}'`),
    "Newer title",
  );
});

test("concurrent identical commands return one receipt and exactly two occurrences", async () => {
  const outputs = await Promise.all([
    db.concurrent(as(1, command())),
    db.concurrent(as(1, command())),
  ]);
  assert.deepEqual(JSON.parse(outputs[0].stdout), JSON.parse(outputs[1].stdout));
  assert.equal(db.sql("select count(*) from public.routines"), "1");
  assert.equal(db.sql("select count(*) from public.routine_occurrences"), "2");
});

test("one-off has no preview and alternating initial turns name the two planned members", () => {
  save({ ...definition, schedule: { kind: "one_off", date: "2026-09-20" } });
  assert.equal(db.sql("select count(*) from public.routine_occurrences"), "1");
  const second = save(
    { ...definition, assignment: { policy: "alternating", anchorMemberId: id(2) } },
    101,
  );
  assert.equal(
    db.sql(
      `select string_agg(planned_assignee_id::text,',' order by role) from public.routine_occurrences where routine_id='${second.routineId}'`,
    ),
    `${id(2)},${id(1)}`,
  );
  assert.throws(
    () => save({ ...definition, assignment: { policy: "assigned", memberId: id(3) } }, 102),
    /Invalid assignment member/,
  );
});

test("invalid nested fields and unusable intervals leave no routine or receipt", () => {
  for (const invalid of [
    { ...definition, note: "excluded" },
    { ...definition, assignment: { policy: "shared", memberId: id(1) } },
    { ...definition, schedule: { kind: "daily", every: 1 } },
    { ...definition, schedule: { kind: "after_completion", every: 2147483647, unit: "weeks" } },
    { ...definition, schedule: { kind: "after_completion", every: 1, unit: null } },
    { ...definition, schedule: { kind: "one_off", date: "0000-01-01" } },
    { ...definition, title: "🧹".repeat(61) },
    { ...definition, title: "\u00a0\ufeff" },
  ])
    assert.throws(() => save(invalid), /Invalid|exceed/);
  assert.equal(db.sql("select count(*) from public.routines"), "0");
  assert.equal(db.sql("select count(*) from public.nest_routine_creation_receipts"), "0");
});

test("receipt insertion failure rolls back the routine, occurrences and activity atomically", () => {
  db.sql(`create function private.fixture_reject_receipt() returns trigger language plpgsql as $$
    begin raise exception 'fixture receipt failure'; end $$;
    create trigger fixture_reject_receipt before insert on public.nest_routine_creation_receipts
    for each row execute function private.fixture_reject_receipt()`);
  try {
    assert.throws(() => save(), /fixture receipt failure/);
    for (const table of [
      "routines",
      "routine_occurrences",
      "activity_events",
      "nest_routine_creation_receipts",
    ])
      assert.equal(db.sql(`select count(*) from public.${table}`), "0");
  } finally {
    db.sql(
      "drop trigger fixture_reject_receipt on public.nest_routine_creation_receipts; drop function private.fixture_reject_receipt()",
    );
  }
  assert.equal(save().action, "create");
});

test("revoked actors cannot replay receipts and a one-member household cannot create", () => {
  save();
  // Remove fixture-only dependent activity inside the rollback transaction to model administrative revocation.
  assert.throws(
    () =>
      db.sql(
        `begin; delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'; ${as(1, command())}; commit`,
      ),
    /Not authorized/,
  );
  assert.throws(() => save(undefined, 101, 3, 20), /requires two household members/);
  assert.equal(db.sql("select count(*) from public.routines"), "1");
});

test("1,000 generated valid definitions preserve initial recurrence and assignment invariants", () => {
  const schedules = [
    { kind: "daily" },
    { kind: "weekdays", days: [7, 1, 3] },
    { kind: "weekly", weekday: 2 },
    { kind: "biweekly", weekday: 7 },
    { kind: "monthly", dayOfMonth: 31 },
    { kind: "after_completion", every: 3, unit: "days" },
    { kind: "after_completion", every: 2, unit: "weeks" },
    { kind: "one_off", date: "0004-02-29" },
  ];
  for (let start = 0; start < 1000; start += 100) {
    const batch = Array.from({ length: 100 }, (_, offset) => {
      const index = start + offset;
      return {
        operation: id(1000 + index),
        definition: {
          title: `🧹 Household ${index}`,
          schedule: schedules[index % schedules.length],
          assignment:
            index % 2 ? { policy: "alternating", anchorMemberId: id(1) } : { policy: "shared" },
        },
      };
    });
    const encoded = JSON.stringify(batch).replaceAll("'", "''");
    db.sql(
      as(
        1,
        `select public.nest_create_routine('${id(10)}',(x->>'operation')::uuid,x->'definition')
      from jsonb_array_elements('${encoded}'::jsonb) x`,
      ),
    );
  }
  assert.equal(db.sql("select count(*) from public.routines"), "1000");
  assert.equal(db.sql("select count(*) from public.nest_routine_creation_receipts"), "1000");
  assert.equal(
    db.sql(`select count(*) from public.routines r where
    (select count(*) from public.routine_occurrences o where o.routine_id=r.id and role='current')<>1
    or (select count(*) from public.routine_occurrences o where o.routine_id=r.id and role='preview')
      <> case when r.schedule_kind='one_off' then 0 else 1 end`),
    "0",
  );
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences o join public.routines r on r.id=o.routine_id
    where o.due_date <> case when o.role='current' then private.first_routine_due_date(r.schedule_rule,private.household_today())
      else private.next_routine_due_date(r.schedule_rule,private.first_routine_due_date(r.schedule_rule,private.household_today())) end
    or o.planned_assignee_id is distinct from case when r.assignment_policy='shared' then null::uuid
      when o.role='current' then '${id(1)}'::uuid else '${id(2)}'::uuid end`),
    "0",
  );
});
