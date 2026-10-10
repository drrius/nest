import assert from "node:assert/strict";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const migration = "supabase/migrations/20261005100548_native_legacy_attention_dates.sql";
function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create schema private;create role anon nologin;create role authenticated nologin;
    create role service_role nologin;grant usage on schema private to anon,authenticated,service_role;`);
  db.file(migration);
  return db;
}

test("retained deadline arithmetic agrees with Postgres for2928 representable dates and offsets", (t) => {
  const db = fixture(t);
  const value = JSON.parse(
    db.sql(`set role authenticated;
    with inputs as (select d,days from unnest(array[date '0001-01-01',date '2000-02-29',
      date '2026-10-05',date '9999-12-31']) d
      cross join (select generate_series(0,730) days union all select -30) offsets)
    select jsonb_build_object('cases',count(*),'equal',bool_and(private.nest_legacy_attention_deadline(d,days)=d-days)) from inputs`),
  );
  assert.deepEqual(value, { cases: 2928, equal: true });
});

test("date overflow becomes unavailable while null and infinite legacy values retain arithmetic semantics", (t) => {
  const db = fixture(t);
  const value = JSON.parse(
    db.sql(`set role authenticated;select jsonb_build_object(
    'oldUnderflow',private.nest_legacy_attention_deadline(date '4713-01-01 BC',730) is null,
    'largeUnderflow',private.nest_legacy_attention_deadline(date '2026-10-05',2147483647) is null,
    'largeOverflow',private.nest_legacy_attention_deadline(date '2026-10-05',-2147483647) is null,
    'nullDate',private.nest_legacy_attention_deadline(null,30) is null,
    'nullDays',private.nest_legacy_attention_deadline(date '2026-10-05',null) is null,
    'infinite',private.nest_legacy_attention_deadline('infinity',730)='infinity'::date,
    'negativeInfinite',private.nest_legacy_attention_deadline('-infinity',730)='-infinity'::date)`),
  );
  assert.ok(Object.values(value).every((v) => v === true));
});

test("nonfinite query dates are refused before attention-table access", (t) => {
  const db = fixture(t);
  for (const date of ["infinity", "-infinity"])
    assert.throws(
      () =>
        db.sql(
          `set role authenticated;select public.list_home_attention_records('commitments','',0,'${date}')`,
        ),
      /Invalid attention query/,
    );
});

test("deadline helper remains an invoker with no anonymous execute and works for the service caller", (t) => {
  const db = fixture(t);
  assert.throws(
    () => db.sql("set role anon;select private.nest_legacy_attention_deadline('2026-10-05',5)"),
    /permission denied/,
  );
  assert.equal(
    db.sql("set role service_role;select private.nest_legacy_attention_deadline('2026-10-05',5)"),
    "2026-09-30",
  );
  assert.equal(
    db.sql(
      "select prosecdef from pg_proc where oid='private.nest_legacy_attention_deadline(date,integer)'::regprocedure",
    ),
    "f",
  );
});
