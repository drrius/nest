import assert from "node:assert/strict";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { assertEpochSnapshotRace } from "./offline-epoch-snapshot-race.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/grocery-edit-fixture.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "tests/database/grocery-meal-source-fixture.sql",
  "supabase/migrations/20260921090604_native_grocery_snapshot.sql",
];
function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  for (const file of files) db.file(file);
  db.sql(`insert into public.meal_plan_entries values('${id(100)}','${id(10)}','Retained soup','2030-01-07','dinner'),('${id(101)}','${id(20)}','Private meal','2030-01-07','dinner');
    insert into public.grocery_items(id,household_id,name,quantity,unit,category_id,originating_meal_plan_entry_id) values('${id(200)}','${id(10)}','Tomatoes','½','cups','${id(30)}','${id(100)}'),('${id(201)}','${id(20)}','Private groceries',null,null,'${id(31)}','${id(101)}');`);
  const read = (actor = id(1), home = id(10)) =>
    JSON.parse(
      db.sql(
        `set role authenticated;set request.jwt.claim.sub='${actor}';select public.nest_grocery_snapshot('${home}')`,
      ),
    );
  return { db, read };
}
test("grocery snapshot reads retained same-household meal provenance and never exposes foreign or unlinked details", (t) => {
  const f = fixture(t),
    snapshot = f.read();
  assert.equal(snapshot.total, 1);
  assert.deepEqual(snapshot.items[0].mealSource, {
    entryId: id(100),
    householdId: id(10),
    title: "Retained soup",
    date: "2030-01-07",
    slot: "dinner",
  });
  assert.equal(snapshot.items[0].quantity, "½");
  assert.deepEqual(f.read(id(2)), snapshot);
  assert.throws(() => f.read(id(3)), /authorized/);
  assert.throws(() => f.read(id(1), id(20)), /authorized/);
  assert.throws(
    () => f.db.sql(`set role anon;select public.nest_grocery_snapshot('${id(10)}')`),
    /permission denied/,
  );
  // Corrupt linkage is fixture-only: the production composite FK prevents it.
  f.db.sql(
    `update public.grocery_items set originating_meal_plan_entry_id='${id(101)}' where id='${id(200)}'`,
  );
  assert.equal(f.read().items[0].mealSource, null);
  assert.equal(JSON.stringify(f.read()).includes("Private"), false);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.read(), /authorized/);
});
test("atomic grocery snapshot excludes removed/purchased history, retains claimed/check state and preserves deterministic order", (t) => {
  const f = fixture(t);
  f.db
    .sql(`update public.grocery_items set native_checked=true,native_version=9007199254740993 where id='${id(200)}';
    insert into public.grocery_items(id,household_id,name,state,claimed_by_session_id,purchased_at,removed_at,sort_order) values
    ('${id(202)}','${id(10)}','Claimed','claimed','${id(999)}',null,null,0),
    ('${id(203)}','${id(10)}','History','purchased',null,now(),null,0),
    ('${id(204)}','${id(10)}','Removed','removed',null,null,now(),0);
    update public.grocery_items set sort_order=2 where id='${id(200)}';`);
  const snapshot = f.read();
  assert.equal(snapshot.total, 2);
  assert.deepEqual(
    snapshot.items.map((row) => row.itemId),
    [id(202), id(200)],
  );
  assert.equal(snapshot.items[0].legacyState, "claimed");
  assert.equal(snapshot.items[1].checked, true);
  assert.equal(typeof snapshot.items[1].version, "string");
  f.db.sql(
    `update public.grocery_categories set archived_at=now() where id='${id(30)}'; update public.meal_plan_entries set date=null,slot=null where id='${id(100)}'`,
  );
  assert.equal(f.read().items[1].mealSource.date, null);
  assert.equal(f.read().items[1].mealSource.title, "Retained soup");
});

test("unsupported legacy source dates do not invalidate an otherwise readable grocery snapshot", (t) => {
  const f = fixture(t);
  for (const date of ["infinity", "-infinity", "10000-01-01", "0001-01-01 BC"]) {
    f.db.sql(`update public.meal_plan_entries set date='${date}' where id='${id(100)}'`);
    const snapshot = f.read();
    assert.equal(snapshot.total, 1);
    assert.equal(snapshot.items[0].name, "Tomatoes");
    assert.deepEqual(snapshot.items[0].mealSource, {
      entryId: id(100),
      householdId: id(10),
      title: "Retained soup",
      date: null,
      slot: "dinner",
    });
  }
  for (const date of ["0001-01-01", "9999-12-31"]) {
    f.db.sql(`update public.meal_plan_entries set date='${date}' where id='${id(100)}'`);
    assert.equal(f.read().items[0].mealSource.date, date);
  }
});

test("grocery data and epoch share the original snapshot across committed rotation", async (t) => {
  const { db } = fixture(t);
  for (const file of [
    "20260925185000_native_household_write_barrier.sql",
    "20260925202107_native_offline_cutover_epoch.sql",
    "20260925203217_native_offline_epoch_snapshots.sql",
  ])
    db.file(`supabase/migrations/${file}`);
  const { after } = await assertEpochSnapshotRace(
    db,
    `set role authenticated; set request.jwt.claim.sub='${id(1)}';select public.nest_grocery_epoch_snapshot('${id(10)}')`,
    `update public.grocery_items set name='After epoch rotation' where id='${id(200)}'`,
  );
  assert.equal(after.items[0].name, "After epoch rotation");
});
