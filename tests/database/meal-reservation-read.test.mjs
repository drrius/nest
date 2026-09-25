import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json, input } from "./meal-proposal-reservation-fixture.mjs";
test("reservation recovery is read-only, scoped and bound to the entire immutable request", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260925195906_native_meal_reservation_recovery.sql");
  const read = (op, value = input(), actor = id(1), home = id(10)) =>
    JSON.parse(
      f.db.sql(
        `begin read only; ${as(`select coalesce(public.nest_read_meal_reservation('${home}','${op}',${json(value)}),'null'::jsonb)`, actor)}; rollback;`,
      ),
    );
  assert.equal(read(id(800)), null);
  const saved = f.begin(id(800));
  assert.deepEqual(read(id(800)), saved);
  assert.equal(read(id(800), input(), id(2)), null);
  assert.throws(() => read(id(800), input(), id(3)), /authorized/);
  assert.throws(() => read(id(800), input(), id(1), id(20)), /authorized/);
  for (const patch of [
    { familiarOnly: true },
    { expectedWeekRevision: "1" },
    { weekStart: "2030-01-14" },
  ])
    assert.throws(() => read(id(800), input(patch)), /operation changed/);
  f.discard(id(801), saved.proposalId);
  assert.throws(() => read(id(801)), /operation changed/);
  assert.deepEqual(read(id(800)), saved);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role};select public.nest_read_meal_reservation('${id(10)}','${id(800)}',${json(input())})`,
        ),
      /permission denied/,
    );
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "1");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(id(800)), /authorized/);
});
