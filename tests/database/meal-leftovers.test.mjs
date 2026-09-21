import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture as selectionFixture,
  id,
  as,
  json,
  week,
  Schema,
} from "./recipe-selection-fixture.mjs";
import {
  PlaceLeftoversInput,
  LeftoverPlacementReceipt,
} from "../../packages/contracts/src/meal-leftovers.ts";
function fixture(t) {
  const f = selectionFixture(t);
  f.db.file("supabase/migrations/20260921020754_native_meal_leftovers.sql");
  const source = f.select(id(800));
  const input = (patch = {}) => ({
    entryId: source.entryId,
    sourceWeekStart: week,
    expectedSourceRevision: "1",
    targetWeekStart: week,
    expectedTargetRevision: "1",
    date: "2030-01-08",
    slot: "dinner",
    ...patch,
  });
  const command = (operation, value, actor = id(1)) =>
    as(`select public.nest_place_leftovers('${id(10)}','${operation}',${json(value)})`, actor);
  const place = (operation, value = input(), actor) =>
    Schema.decodeUnknownSync(LeftoverPlacementReceipt)(
      JSON.parse(f.db.sql(command(operation, value, actor))),
      { onExcessProperty: "error" },
    );
  return { ...f, source, input, command, place };
}
test("leftovers copy retained source ingredients rather than the current library and replay without duplicates", async (t) => {
  const f = fixture(t),
    value = f.input();
  f.db.sql(
    `update public.meal_definitions set archived_at=now(),name='Later library edit' where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.command(id(801), value))),
  );
  const saved = JSON.parse(results[0].stdout);
  assert.equal(Schema.is(LeftoverPlacementReceipt)(saved), true);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(saved.sourceRevision, "2");
  assert.equal(saved.targetRevision, "2");
  assert.equal(saved.sourceEntryId, f.source.entryId);
  assert.notEqual(saved.entryId, f.source.entryId);
  const detail = f.read(saved.entryId, "2");
  assert.equal(detail.entry.leftoverSourceId, f.source.entryId);
  assert.equal(detail.entry.title, "Legacy soup");
  assert.equal(detail.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.equal(f.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "1");
  assert.deepEqual(f.place(id(801), value), saved);
  assert.throws(() => f.place(id(801), f.input({ date: "2030-01-09" })), /operation changed/);
});
test("cross-week leftovers increment only the destination and keep the source stable", (t) => {
  const f = fixture(t);
  const value = f.input({
    targetWeekStart: "2030-01-14",
    expectedTargetRevision: "0",
    date: "2030-01-14",
  });
  const saved = f.place(id(801), value);
  assert.equal(saved.sourceRevision, "1");
  assert.equal(saved.targetRevision, "1");
  assert.equal(f.read(f.source.entryId, "1").entry.entryId, f.source.entryId);
  assert.equal(
    f.read(saved.entryId, "1", id(1), { start: "2030-01-14" }).snapshot.recipe.title,
    "Legacy soup",
  );
});
test("source removal, source type, dates, tenant and stale baselines fail without changing history", (t) => {
  const f = fixture(t);
  for (const value of [
    f.input({ date: week }),
    f.input({ expectedSourceRevision: "0", expectedTargetRevision: "0" }),
    f.input({ entryId: id(999) }),
  ])
    assert.throws(() => f.place(id(801), value), /earlier|changed/i);
  assert.throws(() => f.place(id(801), f.input(), id(3)), /authorized/);
  const saved = f.place(id(801));
  assert.throws(
    () =>
      f.place(
        id(802),
        f.input({
          entryId: saved.entryId,
          expectedSourceRevision: "2",
          expectedTargetRevision: "2",
          date: "2030-01-09",
        }),
      ),
    /earlier/,
  );
  assert.throws(
    () =>
      f.db.sql(
        as(
          `select public.nest_remove_meal('${id(10)}','${id(820)}',${json({ weekStart: week, expectedRevision: "2", entryId: f.source.entryId })})`,
        ),
      ),
    /changed/i,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "1");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.place(id(801)), /authorized/);
  assert.equal(f.db.sql(as("select count(*) from public.nest_meal_leftover_receipts")), "0");
});
test("receipt failure rolls back the new entry, snapshot and both week baselines", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  f.db.sql(
    `create function private.fail_leftover_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected receipt failure'; end $$; create trigger fail_leftover_receipt before insert on public.nest_meal_leftover_receipts for each row execute function private.fail_leftover_receipt()`,
  );
  assert.throws(() => f.place(id(801)), /Injected receipt failure/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "1");
  f.db.sql("drop trigger fail_leftover_receipt on public.nest_meal_leftover_receipts");
  assert.equal(f.place(id(801)).targetRevision, "2");
});
test("legacy one-off sources retain unknown historical detail and no preparation is generated", (t) => {
  const f = fixture(t);
  const source = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_place_meal('${id(10)}','${id(810)}',${json({ weekStart: week, expectedRevision: "1", date: week, slot: "lunch", title: "One-off meal" })})`,
      ),
    ),
  );
  const saved = f.place(
    id(811),
    f.input({ entryId: source.entryId, expectedSourceRevision: "2", expectedTargetRevision: "2" }),
  );
  const detail = f.read(saved.entryId, "3");
  assert.equal(detail.entry.title, "One-off meal");
  assert.equal(detail.entry.definitionId, null);
  assert.equal(detail.snapshot, null);
});
test("leftover contracts reject mismatched same-week revisions and out-of-week dates", () => {
  const input = {
    entryId: id(1),
    sourceWeekStart: week,
    expectedSourceRevision: "0",
    targetWeekStart: week,
    expectedTargetRevision: "0",
    date: "2030-01-08",
    slot: "dinner",
  };
  assert.equal(Schema.is(PlaceLeftoversInput)(input), true);
  for (const patch of [
    { date: "2030-01-14" },
    { sourceWeekStart: "2030-01-08" },
    { expectedTargetRevision: "1" },
    { expectedSourceRevision: "9223372036854775808" },
  ])
    assert.equal(Schema.is(PlaceLeftoversInput)({ ...input, ...patch }), false);
});

test("generated later-day slots preserve source identity, recipe version and exact week revisions", (t) => {
  const f = fixture(t);
  let revision = 1;
  for (let day = 8; day <= 13; day++)
    for (const slot of ["breakfast", "lunch", "dinner"]) {
      const saved = f.place(
        id(900 + revision),
        f.input({
          date: `2030-01-${String(day).padStart(2, "0")}`,
          slot,
          expectedSourceRevision: String(revision),
          expectedTargetRevision: String(revision),
        }),
      );
      revision++;
      assert.equal(saved.sourceRevision, String(revision));
      assert.equal(saved.targetRevision, String(revision));
      const detail = f.read(saved.entryId, String(revision));
      assert.equal(detail.entry.leftoverSourceId, f.source.entryId);
      assert.deepEqual(detail.snapshot, f.read(f.source.entryId, String(revision)).snapshot);
    }
  assert.equal(f.db.sql("select count(*) from public.nest_meal_leftover_receipts"), "18");
  assert.equal(f.db.sql("select count(*) from public.grocery_items"), "1");
});
test("racing source removal and leftover placement never leave an active orphan", async (t) => {
  const f = fixture(t);
  const removal = as(
    `select public.nest_remove_meal('${id(10)}','${id(820)}',${json({ weekStart: week, expectedRevision: "1", entryId: f.source.entryId })})`,
  );
  const results = await Promise.allSettled([
    f.db.concurrent(removal),
    f.db.concurrent(f.command(id(821), f.input())),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    f.db.sql(
      `select count(*) from public.meal_plan_entries child join public.meal_plan_entries source on source.id=child.leftover_of_entry_id where child.removed_at is null and source.removed_at is not null`,
    ),
    "0",
  );
});
