import assert from "node:assert/strict";
import { test, after } from "node:test";
import { fixture, id, week, as } from "./meal-move-fixture.mjs";
const { db, add, preparation, input, move, revision } = fixture();
after(() => db.stop());
test("cross-week move preserves snapshots, preparation and groceries and replays after partner changes", () => {
  const entry = add(600).entryId,
    occurrence = preparation(entry, id(601));
  db.sql(`insert into public.meal_definitions(id,household_id,name) values('${id(699)}','${id(10)}','Saved pasta');
    insert into public.grocery_items(id,household_id,name) values('${id(698)}','${id(10)}','Existing grocery');
    update public.meal_plan_entries set meal_definition_id='${id(699)}',groceries_materialized_at=null where id='${entry}'`);
  const original = db.sql(
    `select (to_jsonb(e)-'date'-'slot'-'updated_at')::text from public.meal_plan_entries e where id='${entry}'`,
  );
  const prep = db.sql(
    `select to_jsonb(o)::text from public.routine_occurrences o where id='${occurrence}'`,
  );
  const groceries = db.sql(
    "select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]')::text from public.grocery_items g",
  );
  const value = input(entry),
    saved = move(id(602), value);
  assert.equal(saved.sourceRevision, (BigInt(value.expectedSourceRevision) + 1n).toString());
  assert.equal(saved.targetRevision, "1");
  assert.equal(
    db.sql(
      `select (to_jsonb(e)-'date'-'slot'-'updated_at')::text from public.meal_plan_entries e where id='${entry}'`,
    ),
    original,
  );
  assert.equal(
    db.sql(`select to_jsonb(o)::text from public.routine_occurrences o where id='${occurrence}'`),
    prep,
  );
  assert.equal(
    db.sql(
      "select coalesce(jsonb_agg(to_jsonb(g) order by id),'[]')::text from public.grocery_items g",
    ),
    groceries,
  );
  db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner edit',removed_at=now() where id='${entry}'`,
  );
  assert.deepEqual(move(id(602), value), saved);
  assert.throws(() => move(id(602), { ...value, slot: "dinner" }), /operation changed/);
});
test("same-week move advances once and stale or occupied targets leave both weeks unchanged", () => {
  const entry = add(610).entryId,
    value = input(entry, week);
  const saved = move(id(611), value);
  assert.equal(saved.sourceRevision, saved.targetRevision);
  assert.equal(saved.sourceRevision, (BigInt(value.expectedSourceRevision) + 1n).toString());
  assert.throws(() => move(id(612), value), /Meal week changed/);
  const other = add(613).entryId,
    occupied = input(other, week),
    before = revision(week);
  assert.throws(() => move(id(614), occupied), /Meal week changed/);
  assert.equal(revision(week), before);
  assert.throws(() => move(id(615), input(entry, week)), /already occupies/);
});
test("source and target revision checks reject stale cross-week commands atomically", () => {
  const entry = add(620).entryId,
    value = input(entry, "2030-01-21");
  db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','2030-01-22','dinner','Partner')`,
  );
  const before = revision(week);
  assert.throws(() => move(id(621), value), /Meal week changed/);
  assert.equal(revision(week), before);
  assert.equal(db.sql(`select date::text from public.meal_plan_entries where id='${entry}'`), week);
});
test("active leftover ordering blocks moving its source beyond it and moving a child before its source", () => {
  const entry = add(630).entryId;
  db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(631)}','${id(10)}','2030-01-08','dinner','Leftovers','${entry}')`,
  );
  assert.throws(() => move(id(632), input(entry, "2030-01-21")), /Meal week changed/);
  assert.throws(() => move(id(633), { ...input(id(631), week), date: week }), /Meal week changed/);
});
test("receipt insertion failure rolls back date, slot and both counters", () => {
  const entry = add(640).entryId,
    value = input(entry, "2030-02-04");
  db.sql(
    `create function private.reject_move_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected move failure'; end $$; create trigger reject_move_receipt before insert on public.nest_meal_move_receipts for each row execute function private.reject_move_receipt()`,
  );
  try {
    assert.throws(() => move(id(641), value), /Injected move failure/);
    assert.equal(revision(week), value.expectedSourceRevision);
    assert.equal(revision(value.targetWeekStart), "0");
    assert.equal(
      db.sql(`select date::text from public.meal_plan_entries where id='${entry}'`),
      week,
    );
  } finally {
    db.sql("drop trigger reject_move_receipt on public.nest_meal_move_receipts");
  }
});
test("move authorization, actor-private receipts and strict fields reject foreign effects", () => {
  const entry = add(650).entryId,
    value = input(entry, "2030-02-11");
  for (const scope of [{ actor: id(3) }, { household: id(20) }])
    assert.throws(() => move(id(651), value, scope), /Not authorized/);
  for (const patch of [
    { actorId: id(2) },
    { entryId: null },
    { expectedSourceRevision: 1 },
    { targetWeekStart: week },
  ])
    assert.throws(() => move(id(652), { ...value, ...patch }), /Invalid/);
  move(id(653), value);
  assert.equal(
    db.sql(
      as(
        `select count(*) from public.nest_meal_move_receipts where operation_id='${id(653)}'`,
        id(2),
      ),
    ),
    "0",
  );
  assert.throws(
    () => db.sql(`set role anon; select public.nest_move_meal('${id(10)}','${id(654)}','{}')`),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as("delete from public.nest_meal_move_receipts")),
    /permission denied/,
  );
});
