import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, json, week } from "./recipe-selection-fixture.mjs";
import { oneOffMigration, oneOffRecipe, seedOneOff } from "./one-off-recipe-fixture.mjs";

test("nullable one-off provenance preserves old saved recipes and denies direct writers", (t) => {
  const f = fixture(t);
  const selected = f.select(id(800));
  const before = f.read(selected.entryId, "1");
  f.db.file(oneOffMigration);
  assert.deepEqual(f.read(selected.entryId, "1"), before);
  seedOneOff(f.db);
  assert.deepEqual(f.read(id(940), "2").snapshot, { libraryRevision: null, recipe: oneOffRecipe });
  assert.deepEqual(f.read(id(940), "2", id(2)).snapshot.recipe, oneOffRecipe);
  assert.throws(() => f.read(id(940), "2", id(3)), /authorized/);
  for (const actor of [id(1), id(2), id(3)]) {
    assert.throws(
      () =>
        f.db.sql(
          as(
            `update public.nest_planned_recipe_snapshots
      set recipe='{}'::jsonb where entry_id='${id(940)}'`,
            actor,
          ),
        ),
      /permission denied/,
    );
  }
  assert.equal(
    f.db.sql(as("select count(*) from public.nest_planned_recipe_snapshots", id(3))),
    "0",
  );
  assert.throws(
    () => f.db.sql("set role anon; select * from public.nest_planned_recipe_snapshots"),
    /permission denied/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.read(id(940), "2"), /authorized/);
});

test("one-off snapshot provenance cannot be mixed and legacy meal rewrites cannot alter retained content", (t) => {
  const f = fixture(t);
  f.db.file(oneOffMigration);
  seedOneOff(f.db);
  for (const update of [
    "library_revision=1",
    "recipe=recipe-'definitionId'",
    `recipe=jsonb_set(recipe,'{definitionId}',to_jsonb('${id(200)}'::text))`,
  ]) {
    assert.throws(
      () =>
        f.db.sql(`update public.nest_planned_recipe_snapshots set ${update}
      where entry_id='${id(940)}'`),
      /nest_recipe_snapshot_provenance/,
    );
  }
  assert.throws(
    () =>
      f.db.sql(`update public.meal_plan_entries set title_snapshot='Changed'
    where id='${id(940)}'`),
    /immutable/,
  );
  assert.deepEqual(f.read(id(940), "1").snapshot.recipe, oneOffRecipe);
});

test("one-off leftovers retain complete recipes, immutable retries and unchanged library and groceries", (t) => {
  const f = fixture(t);
  f.db.file(oneOffMigration);
  f.db.file("supabase/migrations/20260921020754_native_meal_leftovers.sql");
  seedOneOff(f.db);
  const before = f.snapshot();
  const input = {
    entryId: id(940),
    sourceWeekStart: week,
    expectedSourceRevision: "1",
    targetWeekStart: week,
    expectedTargetRevision: "1",
    date: "2030-01-08",
    slot: "lunch",
  };
  const command = as(`select public.nest_place_leftovers('${id(10)}','${id(960)}',${json(input)})`);
  const receipt = JSON.parse(f.db.sql(command));
  assert.deepEqual(JSON.parse(f.db.sql(command)), receipt);
  const detail = f.read(receipt.entryId, "2");
  assert.equal(detail.entry.definitionId, null);
  assert.equal(detail.entry.leftoverSourceId, id(940));
  assert.deepEqual(detail.snapshot, { libraryRevision: null, recipe: oneOffRecipe });
  const after = f.snapshot();
  for (const key of [
    "meal_definitions",
    "meal_grocery_templates",
    "nest_meal_library_revisions",
    "grocery_items",
  ])
    assert.equal(after[key], before[key]);
});
