import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const migration = "supabase/migrations/20261005121644_native_routine_schedule_validation.sql";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const valid = [
  ["one_off", { kind: "one_off", date: "2024-02-29" }],
  ["calendar", { kind: "daily" }],
  ["calendar", { kind: "weekdays", days: [1, 3, 7] }],
  ["calendar", { kind: "weekly", weekday: 7 }],
  ["calendar", { kind: "biweekly", weekday: 1 }],
  ["calendar", { kind: "monthly", dayOfMonth: 31 }],
  ["after_completion", { kind: "after_completion", every: 2147483647, unit: "days" }],
  ["after_completion", { kind: "after_completion", every: 2, unit: "weeks" }],
];
/** @type {Array<[string, Record<string, unknown>]>} */
const regressions = [
  ["calendar", { kind: "weekly" }],
  ["calendar", { kind: "monthly" }],
  ["one_off", { kind: "one_off" }],
  ["after_completion", { kind: "after_completion", every: 1 }],
];

function fixture(t, apply = true, source = "tests/database/routine-creation-fixture.sql") {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file(source);
  if (apply) db.file(migration);
  db.sql(`insert into public.areas(id,household_id,name,sort_order)
    values('${id(30)}','${id(10)}','Fixture area',0)`);
  return db;
}

function evaluate(db, inputs, role = "authenticated") {
  const encoded = JSON.stringify(inputs).replaceAll("'", "''");
  return JSON.parse(
    db.sql(`set role ${role};
    select jsonb_agg(private.is_valid_routine_schedule(x->>0,x->1) order by ordinal)
    from jsonb_array_elements('${encoded}'::jsonb) with ordinality as cases(x,ordinal)`),
  );
}

function insert(db, kind, rule) {
  const encoded = JSON.stringify(rule).replaceAll("'", "''");
  return db.sql(`insert into public.routines(household_id,title,area_id,
    assignment_policy,schedule_kind,schedule_rule) values
    ('${id(10)}','Fixture chore','${id(30)}','shared','${kind}','${encoded}')`);
}

test("missing schedule fields reproduce NULL/true then become false without changing valid rules", (t) => {
  const db = fixture(t, false);
  assert.deepEqual(evaluate(db, regressions), [null, null, null, true]);
  const previous = evaluate(db, valid);
  const privileges = db.sql(`select proacl::text from pg_proc
    where oid='private.is_valid_routine_schedule(text,jsonb)'::regprocedure`);
  assert.ok(previous.every((value) => value === true));
  db.file(migration);
  assert.deepEqual(
    evaluate(db, regressions),
    regressions.map(() => false),
  );
  assert.deepEqual(evaluate(db, valid), previous);
  assert.equal(
    db.sql(`select proacl::text from pg_proc
    where oid='private.is_valid_routine_schedule(text,jsonb)'::regprocedure`),
    privileges,
  );
  assert.equal(db.sql("select count(*) from public.routines"), "0");
});

test("every required key, exact shape and schedule category reject missing/null/wrong inputs", (t) => {
  const db = fixture(t);
  const inputs = [];
  for (const [kind, rule] of valid) {
    for (const key of Object.keys(rule)) {
      const missing = { ...rule };
      delete missing[key];
      inputs.push([kind, missing], [kind, { ...rule, [key]: null }]);
    }
    inputs.push([null, rule], ["unknown", rule], [kind, { ...rule, extra: true }]);
    inputs.push([kind, null], [kind, []], [kind, "daily"], [kind, 1], [kind, true]);
    for (const wrong of ["one_off", "calendar", "after_completion"].filter((v) => v !== kind))
      inputs.push([wrong, rule]);
  }
  assert.deepEqual(
    evaluate(db, inputs),
    inputs.map(() => false),
  );
});

test("bounded integers, unique weekdays and exact dates retain their database invariants", (t) => {
  const db = fixture(t);
  const inputs = [];
  const expected = [];
  for (const [kind, field, max] of [
    ["weekly", "weekday", 7],
    ["biweekly", "weekday", 7],
    ["monthly", "dayOfMonth", 31],
  ]) {
    for (let value = -3; value <= 35; value++) {
      inputs.push(["calendar", { kind, [field]: value }]);
      expected.push(value >= 1 && value <= max);
    }
  }
  for (const value of [null, "1", true, {}, [], -1, 0, 1.1, 2147483648]) {
    inputs.push(["after_completion", { kind: "after_completion", every: value, unit: "days" }]);
    expected.push(false);
  }
  for (const days of [[], [1, 1], [0], [8], [1, null], ["1"], [1.5], {}, null]) {
    inputs.push(["calendar", { kind: "weekdays", days }]);
    expected.push(false);
  }
  for (const unit of [null, "hours", "Days", 1, [], {}]) {
    inputs.push(["after_completion", { kind: "after_completion", every: 1, unit }]);
    expected.push(false);
  }
  for (let year = 1996; year <= 2032; year++) {
    inputs.push(["one_off", { kind: "one_off", date: `${year}-02-29` }]);
    expected.push(new Date(`${year}-02-29T00:00:00Z`).getUTCMonth() === 1);
  }
  for (const date of [
    "infinity",
    "-infinity",
    "2026-02-30",
    "2026-1-01",
    "today",
    "",
    "0000-01-01",
  ]) {
    inputs.push(["one_off", { kind: "one_off", date }]);
    expected.push(false);
  }
  assert.deepEqual(evaluate(db, inputs), expected);
  assert.equal(
    db.sql("set role service_role;select private.nest_routine_schedule_weekdays('[1,3,7]')"),
    "t",
  );
});

test("all nonempty weekday subsets remain valid while duplicates and decimal encodings are refused", (t) => {
  const db = fixture(t);
  const inputs = [];
  const expected = [];
  for (let bits = 1; bits < 128; bits++) {
    const days = Array.from({ length: 7 }, (_, index) => index + 1).filter(
      (day) => bits & (1 << (day - 1)),
    );
    inputs.push(["calendar", { kind: "weekdays", days }]);
    inputs.push(["calendar", { kind: "weekdays", days: [...days].reverse() }]);
    inputs.push(["calendar", { kind: "weekdays", days: [...days, days[0]] }]);
    expected.push(true, true, false);
  }
  assert.deepEqual(evaluate(db, inputs), expected);
  assert.equal(
    db.sql(`with numbers(value,expected) as (values
    ('1.0',false),('1.5',false),('1e0',true),('1e1',true),('1e10',false),
    ('2147483647',true),('2147483648',false),('"1"',false),('null',false))
    select bool_and(private.nest_routine_schedule_integer(value::jsonb,2147483647)=expected) from numbers`),
    "t",
  );
});

test("actual retained routine CHECK refuses malformed inserts and updates while retaining valid rows", (t) => {
  const db = fixture(t);
  for (const [kind, rule] of valid) insert(db, kind, rule);
  const before = db.sql("select jsonb_agg(to_jsonb(r) order by id) from public.routines r");
  for (const [kind, rule] of regressions)
    assert.throws(() => insert(db, kind, rule), /violates check constraint/);
  assert.throws(
    () =>
      db.sql(
        "update public.routines set schedule_kind='calendar',schedule_rule='{\"kind\":\"weekly\"}'",
      ),
    /violates check constraint/,
  );
  assert.equal(db.sql("select jsonb_agg(to_jsonb(r) order by id) from public.routines r"), before);
  assert.equal(
    db.sql(`select bool_and(convalidated) from pg_constraint
    where conrelid='public.routines'::regclass and pg_get_constraintdef(oid) like '%is_valid_routine_schedule(%'`),
    "t",
  );
});

test("migration revalidation refuses preexisting malformed rows and a transaction preserves them", (t) => {
  const db = fixture(t, false);
  insert(db, "after_completion", { kind: "after_completion", every: 1 });
  const before = db.sql("select jsonb_agg(to_jsonb(r) order by id) from public.routines r");
  assert.throws(
    () => db.sql(`begin;${readFileSync(migration, "utf8")}commit;`),
    /violated by some row/,
  );
  assert.equal(db.sql("select jsonb_agg(to_jsonb(r) order by id) from public.routines r"), before);
  assert.deepEqual(evaluate(db, regressions), [null, null, null, true]);
  assert.equal(
    db.sql("select count(*) from pg_proc where proname like 'nest_routine_schedule_%'"),
    "0",
  );
});

test("the retained authenticated editor rejects incomplete schedules before changing chore history", (t) => {
  const db = fixture(t, true, "tests/database/routine-edit-fixture.sql");
  db.sql(`grant execute on function public.update_routine_definition(
    uuid,text,text,uuid,uuid,text,uuid,uuid,text,jsonb,text,date,date,boolean) to authenticated`);
  insert(db, "calendar", { kind: "daily" });
  const routineId = db.sql("select id from public.routines");
  const snapshot = () =>
    db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o))`);
  const before = snapshot();
  for (const [kind, rule] of regressions) {
    const encoded = JSON.stringify(rule).replaceAll("'", "''");
    const command = `select public.update_routine_definition('${routineId}',
      p_schedule_kind=>'${kind}',p_schedule_rule=>'${encoded}',p_rebuild_window=>false)`;
    assert.throws(
      () => db.sql(`set role authenticated;set request.jwt.claim.sub='${id(1)}';${command}`),
      /invalid schedule rule/,
    );
    assert.throws(
      () => db.sql(`set role authenticated;set request.jwt.claim.sub='${id(3)}';${command}`),
      /not a member/,
    );
  }
  assert.equal(snapshot(), before);
});

test("validation helpers have no data privileges or anonymous execution and native creation stays authorized", (t) => {
  const db = fixture(t);
  db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
  assert.equal(
    db.sql(`select bool_and(not prosecdef and provolatile='i' and proconfig=array['search_path=""']
    and not has_function_privilege('anon',oid,'execute')) from pg_proc
    where pronamespace='private'::regnamespace and proname like 'nest_routine_schedule_%'`),
    "t",
  );
  const definition = JSON.stringify({
    title: "Fixture chore",
    schedule: { kind: "weekly", weekday: 2 },
    assignment: { policy: "shared" },
  });
  const command = `select public.nest_create_routine('${id(10)}','${id(99)}','${definition}')`;
  assert.throws(
    () => db.sql(`set role authenticated;set request.jwt.claim.sub='${id(3)}';${command}`),
    /Not authorized/,
  );
  assert.throws(() => db.sql(`set role anon;${command}`), /permission denied/);
  db.sql(`set role authenticated;set request.jwt.claim.sub='${id(1)}';${command}`);
  assert.equal(
    db.sql(
      `set role authenticated;set request.jwt.claim.sub='${id(3)}';select count(*) from public.routines`,
    ),
    "0",
  );
  assert.equal(db.sql("select count(*) from public.routines"), "1");
});
