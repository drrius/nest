import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  id,
  as,
  input,
  command,
  Schema,
  PlaceRecipeInput,
  ReplaceWithRecipeInput,
} from "./recipe-selection-fixture.mjs";
test("selection captures unknown legacy metadata and ordered quantities permanently", (t) => {
  const f = fixture(t),
    saved = f.select(id(800)),
    first = f.read(saved.entryId, saved.revision);
  assert.equal(saved.revision, "1");
  assert.equal(saved.libraryRevision, "0");
  assert.equal(first.snapshot.recipe.servings, null);
  assert.equal(first.snapshot.recipe.instructions, null);
  assert.equal(first.snapshot.recipe.recipeUrl, "javascript:legacy-link");
  assert.deepEqual(
    first.snapshot.recipe.ingredients.map((i) => [i.ingredientId, i.quantity, i.unit]),
    [
      [id(300), "1/2", "cup"],
      [id(301), "250", "g"],
    ],
  );
  const groceries = f.snapshot().grocery_items;
  f.db.sql(
    `update public.meal_definitions set name='Different recipe',archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99',archived_at=now() where id='${id(300)}'`,
  );
  assert.deepEqual(f.read(saved.entryId, "1"), first);
  assert.deepEqual(f.select(id(800)), saved);
  assert.equal(f.snapshot().grocery_items, groceries);
  assert.throws(
    () =>
      f.db.sql(
        `update public.meal_plan_entries set title_snapshot='Rewrite history' where id='${saved.entryId}'`,
      ),
    /immutable/,
  );
  assert.throws(
    () => f.db.sql(`delete from public.meal_plan_entries where id='${saved.entryId}'`),
    /foreign key/,
  );
  assert.throws(
    () => f.db.sql(as(`update public.nest_planned_recipe_snapshots set recipe='{}'`)),
    /permission denied/,
  );
});
test("concurrent selection replay commits once and cannot change invocation identity", async (t) => {
  const f = fixture(t),
    results = await Promise.all(Array.from({ length: 4 }, () => f.db.concurrent(command(id(800)))));
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_selection_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "1");
  assert.throws(() => f.select(id(800), input({ slot: "lunch" })), /operation changed/);
  assert.throws(
    () => f.select(id(800), input({ entryId: saved.entryId }), true),
    /operation changed/,
  );
});
test("replacement skips linked preparation, retains old snapshot and never creates groceries", (t) => {
  const f = fixture(t),
    first = f.select(id(800));
  const preparation = f.preparation(first.entryId, id(810));
  const baseline = f.baseline(first.entryId);
  const groceries = f.snapshot().grocery_items;
  const replacement = f.select(id(801), input({ ...baseline, definitionId: id(201) }), true);
  assert.equal(replacement.previousEntryId, first.entryId);
  assert.notEqual(replacement.entryId, first.entryId);
  assert.equal(BigInt(replacement.revision), BigInt(baseline.expectedRevision) + 2n);
  assert.equal(replacement.skippedPreparationId, preparation);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "2");
  assert.equal(f.read(first.entryId, replacement.revision).entry, null);
  assert.equal(
    f.read(replacement.entryId, replacement.revision).snapshot.recipe.title,
    "Second recipe",
  );
  assert.equal(f.snapshot().grocery_items, groceries);
  assert.deepEqual(
    f.select(id(801), input({ ...baseline, definitionId: id(201) }), true),
    replacement,
  );
});
test("snapshot or final receipt failure rolls back replacement and preparation atomically", (t) => {
  const f = fixture(t),
    first = f.select(id(800));
  f.preparation(first.entryId, id(810));
  const value = input({ ...f.baseline(first.entryId), definitionId: id(201) }),
    before = f.snapshot();
  f.db.sql(
    `create function private.reject_selection() returns trigger language plpgsql as $$ begin raise exception 'Injected selection failure'; end $$`,
  );
  for (const table of ["nest_planned_recipe_snapshots", "nest_recipe_selection_receipts"]) {
    f.db.sql(
      `create trigger reject_selection before insert on public.${table} for each row execute function private.reject_selection()`,
    );
    assert.throws(() => f.select(id(801), value, true), /Injected selection failure/);
    assert.deepEqual(f.snapshot(), before);
    f.db.sql(`drop trigger reject_selection on public.${table}`);
  }
  assert.equal(f.select(id(801), value, true).previousEntryId, first.entryId);
});
test("current membership gates shared snapshots and private receipt recovery", (t) => {
  const f = fixture(t),
    saved = f.select(id(800));
  assert.deepEqual(f.read(saved.entryId, "1", id(2)), f.read(saved.entryId, "1"));
  assert.equal(
    f.db.sql(as("select count(*) from public.nest_recipe_selection_receipts", id(2))),
    "0",
  );
  for (const actor of [id(3), id(4)]) {
    assert.throws(() => f.read(saved.entryId, "1", actor), /Not authorized/);
    assert.throws(() => f.select(id(802), input(), false, { actor }), /Not authorized/);
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_planned_recipe_snapshots", actor)),
      "0",
    );
  }
  assert.throws(
    () => f.db.sql("set role anon; select public.nest_place_recipe(null,null,'{}')"),
    /permission denied/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.select(id(800)), /Not authorized/);
  assert.throws(() => f.read(saved.entryId, "1"), /Not authorized/);
});
test("invalid inputs, stale/foreign recipes and occupied destinations cannot change state", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  for (const patch of [
    { operationId: id(8) },
    { title: "Injected" },
    { expectedLibraryRevision: "01" },
    { expectedLibraryRevision: "9223372036854775808" },
    { date: "2030-01-14" },
    { slot: "snack" },
    { definitionId: "invalid" },
    { actorId: id(2) },
  ]) {
    const value = input(patch);
    assert.throws(() =>
      Schema.decodeUnknownSync(PlaceRecipeInput)(value, { onExcessProperty: "error" }),
    );
    assert.throws(() => f.select(id(800), value), /Invalid/);
  }
  for (const patch of [
    { expectedRevision: "1" },
    { expectedLibraryRevision: "1" },
    { definitionId: id(202) },
    { definitionId: id(999) },
  ])
    assert.throws(() => f.select(id(800), input(patch)), /changed/);
  assert.deepEqual(f.snapshot(), before);
  const saved = f.select(id(800));
  const after = f.snapshot();
  assert.throws(() => f.select(id(801), input({ expectedRevision: "1" })), /occupied/);
  assert.deepEqual(f.snapshot(), after);
  f.add(700);
  f.db.sql(`update public.meal_plan_entries set slot='lunch' where id='${id(700)}'`);
  const legacy = f.read(id(700), f.baseline(id(700)).expectedRevision);
  assert.equal(legacy.entry.entryId, id(700));
  assert.equal(legacy.snapshot, null);
  assert.throws(() => f.read(saved.entryId, "0"), /changed/);
  const bad = input({ entryId: saved.entryId, expectedRevision: "9223372036854775806" });
  assert.throws(() => Schema.decodeUnknownSync(ReplaceWithRecipeInput)(bad));
  assert.throws(() => f.select(id(803), bad, true), /Invalid/);
});
