import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fixture, id, as, input, valid } from "./meal-placement-fixture.mjs";
const { db, place, read } = fixture();
after(() => db.stop());

test("explicit one-off placement preserves legacy meals and creates no materialization", () => {
  const receipt = place(id(201));
  assert.deepEqual(receipt, {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(201),
    entryId: receipt.entryId,
    weekStart: "2026-09-21",
    date: "2026-09-22",
    slot: "lunch",
    revision: "1",
  });
  assert.equal(read().entries.length, 2);
  assert.equal(read().entries[0].title, "Legacy soup");
  const row = JSON.parse(
    db.sql(`select to_jsonb(e) from public.meal_plan_entries e where id='${receipt.entryId}'`),
  );
  for (const field of [
    "meal_definition_id",
    "leftover_of_entry_id",
    "groceries_materialized_at",
    "recipe_url_snapshot",
    "notes",
    "removed_at",
  ])
    assert.equal(row[field], null);
  assert.equal(db.sql("select count(*) from public.meal_grocery_templates"), "0");
  assert.equal(db.sql(as("select count(*) from public.nest_meal_placement_receipts")), "1");
  assert.equal(db.sql(as("select count(*) from public.nest_meal_placement_receipts", id(2))), "0");
});

test("actor-bound exact retry survives later edits and removal, changed payload is rejected", () => {
  const saved = place(id(201));
  db.sql(
    `update public.meal_plan_entries set title_snapshot='Partner edit', removed_at=now() where id='${saved.entryId}'`,
  );
  assert.deepEqual(place(id(201)), saved);
  assert.equal(read().revision, "2");
  assert.throws(
    () => place(id(201), input(undefined, { title: "Different" })),
    /operation changed/,
  );
  assert.throws(() => place(id(201), input(), { actor: id(2) }), /week changed/);
  assert.equal(db.sql("select count(*) from public.nest_meal_placement_receipts"), "1");
});

test("empty-slot ABA and occupied slots conflict without changing stored meals", () => {
  const before = read();
  assert.throws(() => place(id(202)), /week changed/);
  assert.throws(
    () =>
      place(id(203), input("2026-09-21", { expectedRevision: before.revision, slot: "dinner" })),
    /slot occupied/,
  );
  assert.deepEqual(read(), before);
  assert.equal(db.sql("select count(*) from public.nest_meal_placement_receipts"), "1");
});

test("strict input and shared schema reject malformed dates, hidden fields and unsafe text", () => {
  const cases = [
    null,
    [],
    {},
    { ...input(), actorId: id(1) },
    input(undefined, { title: " " }),
    input(undefined, { title: "\u00a0\ufeff" }),
    input(undefined, { title: "🫒".repeat(61) }),
    input(undefined, { title: "x".repeat(121) }),
    input(undefined, { slot: "snack" }),
    input(undefined, { expectedRevision: "01" }),
    input(undefined, { expectedRevision: "-1" }),
    input(undefined, { expectedRevision: "9223372036854775808" }),
    input(undefined, { expectedRevision: 0 }),
    input(undefined, { weekStart: "2026-09-22" }),
    input("2026-02-30"),
    input("2026-09-28"),
    input(undefined, { weekStart: "0000-01-01" }),
    input(undefined, { weekStart: "9999-12-27" }),
    input(undefined, { date: "2026-09-22\n" }),
    input(undefined, { title: null }),
  ];
  for (const value of cases) {
    // Schema.is permits extra struct keys; the production decoder rejects excess properties.
    if (value && !Object.hasOwn(value, "actorId")) assert.equal(valid(value), false);
    assert.throws(() => place(id(204), value), /Invalid/);
  }
  assert.equal(read().revision, "2");
});

test("Unicode title boundaries preserve exact text; full-week endpoints remain supported", () => {
  for (const [index, week] of ["0001-01-01", "9999-12-20"].entries()) {
    const title = `${"🫒".repeat(59)} a`;
    const value = input(week, { weekStart: week, title });
    assert.equal(valid(value), true);
    assert.equal(place(id(205 + index), value).revision, "1");
    assert.equal(read(week).entries[0].title, title);
  }
});

test("receipt insert failure and revision overflow roll back entries and initial counters", () => {
  db.sql(`create function private.reject_meal_receipt() returns trigger language plpgsql as $$ begin
    raise exception 'Injected receipt failure'; end $$;
    create trigger reject_meal_receipt before insert on public.nest_meal_placement_receipts
    for each row execute function private.reject_meal_receipt()`);
  const value = input("2026-10-05", { weekStart: "2026-10-05" });
  assert.throws(() => place(id(207), value), /Injected receipt failure/);
  assert.deepEqual(read("2026-10-05").entries, []);
  assert.equal(
    db.sql("select count(*) from public.nest_meal_week_revisions where week_start='2026-10-05'"),
    "0",
  );
  db.sql("drop trigger reject_meal_receipt on public.nest_meal_placement_receipts");
  db.sql(
    `insert into public.nest_meal_week_revisions values('${id(10)}','2026-10-05',9223372036854775807)`,
  );
  assert.throws(
    () => place(id(207), { ...value, expectedRevision: "9223372036854775807" }),
    /bigint out of range/,
  );
  assert.deepEqual(read("2026-10-05").entries, []);
});

test("anonymous, foreign and revoked callers cannot write or recover private receipts", () => {
  assert.throws(() => place(id(208), input(), { actor: id(3) }), /Not authorized/);
  assert.throws(() => place(id(208), input(), { household: id(20) }), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_place_meal('${id(10)}','${id(208)}','{}')`),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as("delete from public.nest_meal_placement_receipts")),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as("select private.nest_meal_placement_input('{}')")),
    /permission denied/,
  );
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => place(id(201)), /Not authorized/);
  assert.equal(db.sql(as("select count(*) from public.nest_meal_placement_receipts")), "0");
});
