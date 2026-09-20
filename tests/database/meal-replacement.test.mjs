import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, command } from "./meal-replacement-fixture.mjs";

test("replacement retains old snapshots and groceries, skips real preparation and creates an independent one-off", (t) => {
  const f = fixture(t),
    { db, entry } = f;
  const occurrence = f.preparation(entry, id(601));
  db.sql(`insert into public.meal_definitions(id,household_id,name) values('${id(610)}','${id(10)}','Saved pasta');
    insert into public.grocery_items(id,household_id,name) values('${id(611)}','${id(10)}','Retain groceries');
    update public.meal_plan_entries set meal_definition_id='${id(610)}',recipe_url_snapshot='https://example.test/recipe' where id='${entry}'`);
  const before = f.snapshot(),
    value = f.input(),
    saved = f.replace(id(602), value);
  assert.equal(saved.previousEntryId, entry);
  assert.notEqual(saved.entryId, entry);
  assert.equal(saved.revision, (BigInt(value.expectedRevision) + 2n).toString());
  assert.equal(saved.skippedPreparationId, occurrence);
  const old = JSON.parse(
    db.sql(
      `select (to_jsonb(e)-'removed_at'-'updated_at')::text from public.meal_plan_entries e where id='${entry}'`,
    ),
  );
  const prior = JSON.parse(before.meal_plan_entries)[0];
  delete prior.removed_at;
  delete prior.updated_at;
  assert.deepEqual(old, prior);
  assert.equal(
    db.sql(`select removed_at is not null from public.meal_plan_entries where id='${entry}'`),
    "t",
  );
  const fresh = JSON.parse(
    db.sql(`select to_jsonb(e)::text from public.meal_plan_entries e where id='${saved.entryId}'`),
  );
  for (const field of [
    "meal_definition_id",
    "recipe_url_snapshot",
    "notes",
    "leftover_of_entry_id",
    "groceries_materialized_at",
  ])
    assert.equal(fresh[field], null);
  assert.equal(fresh.title_snapshot, value.title);
  assert.equal(
    db.sql(`select status from public.routine_occurrences where id='${occurrence}'`),
    "skipped",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.routine_occurrences where meal_plan_entry_id='${saved.entryId}'`,
    ),
    "0",
  );
  assert.equal(f.snapshot().grocery_items, before.grocery_items);
  db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner edited replacement',removed_at=now() where id='${saved.entryId}'`,
  );
  assert.deepEqual(f.replace(id(602), value), saved);
  assert.throws(
    () => f.replace(id(602), { ...value, title: "Changed retry" }),
    /operation changed/,
  );
});

test("placement and final receipt failures roll back original removal, actual preparation, week and every receipt", (t) => {
  const f = fixture(t);
  f.preparation(f.entry, id(620));
  const value = f.input(),
    before = f.snapshot();
  f.db.sql(
    `create function private.reject_replacement() returns trigger language plpgsql as $$ begin raise exception 'Injected replacement failure'; end $$`,
  );
  for (const table of ["nest_meal_placement_receipts", "nest_meal_replacement_receipts"]) {
    f.db.sql(
      `create trigger reject_replacement before insert on public.${table} for each row execute function private.reject_replacement()`,
    );
    assert.throws(() => f.replace(id(621), value), /Injected replacement failure/);
    assert.deepEqual(f.snapshot(), before);
    f.db.sql(`drop trigger reject_replacement on public.${table}`);
  }
  assert.equal(f.replace(id(621), value).previousEntryId, f.entry);
});

test("stale, changed-slot, foreign and active-leftover inputs do not remove the original", (t) => {
  const f = fixture(t),
    value = f.input(),
    before = f.snapshot();
  for (const patch of [
    { expectedRevision: "0" },
    { slot: "dinner" },
    { date: "2030-01-08" },
    { entryId: id(999) },
  ]) {
    assert.throws(() => f.replace(id(630), { ...value, ...patch }), /Meal (week|slot) changed/);
    assert.deepEqual(f.snapshot(), before);
  }
  f.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(10)}','2030-01-08','dinner','Leftovers','${f.entry}')`,
  );
  const withChild = f.snapshot();
  assert.throws(() => f.replace(id(631), f.input()), /Meal week changed/);
  assert.deepEqual(f.snapshot(), withChild);
});

test("concurrent identical replacements create once and competing partner baselines conflict", async (t) => {
  const f = fixture(t),
    value = f.input();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => f.db.concurrent(command(id(640), value))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_replacement_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_placement_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_removal_receipts"), "1");
  assert.throws(() => f.replace(id(641), value, { actor: id(2) }), /Meal week changed/);
});

test("receipt authorization remains actor-private and revoked owners cannot replay", (t) => {
  const f = fixture(t),
    value = f.input();
  for (const scope of [{ actor: id(3) }, { household: id(20) }])
    assert.throws(() => f.replace(id(650), value, scope), /Not authorized/);
  assert.throws(
    () =>
      f.db.sql(
        `set role anon; select public.nest_replace_meal('${id(10)}','${id(650)}','${JSON.stringify(value)}')`,
      ),
    /permission denied/,
  );
  const saved = f.replace(id(650), value, { actor: id(2) });
  assert.equal(saved.actorId, id(2));
  assert.equal(f.db.sql(as("select count(*) from public.nest_meal_replacement_receipts")), "0");
  assert.throws(
    () => f.db.sql(as(`delete from public.nest_meal_replacement_receipts`)),
    /permission denied/,
  );
  assert.throws(
    () =>
      f.db.sql(
        as(`select private.nest_replace_meal_entries('${id(10)}','${JSON.stringify(value)}')`),
      ),
    /permission denied/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.throws(() => f.replace(id(650), value, { actor: id(2) }), /Not authorized/);
});
