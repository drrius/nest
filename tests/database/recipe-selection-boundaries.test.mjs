import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, as, week, input, command, json } from "./recipe-selection-fixture.mjs";
test("21 selected snapshots retain the exact recipe from each library revision", (t) => {
  const f = fixture(t),
    receipts = [];
  for (let i = 0; i < 21; i++) {
    const title = `Version ${i}`,
      quantity = `${i + 1}/2`;
    f.db.sql(
      `update public.meal_definitions set name='${title}' where id='${id(200)}'; update public.meal_grocery_templates set quantity='${quantity}' where id='${id(300)}'`,
    );
    const date = `2030-01-${String(7 + Math.floor(i / 3)).padStart(2, "0")}`;
    receipts.push(
      f.select(
        id(800 + i),
        input({
          date,
          slot: ["breakfast", "lunch", "dinner"][i % 3],
          expectedRevision: String(i),
          expectedLibraryRevision: String(2 * i + 2),
        }),
      ),
    );
  }
  f.db.sql(
    `update public.meal_definitions set name='Later',archived_at=now() where id='${id(200)}'`,
  );
  for (const [i, receipt] of receipts.entries()) {
    const saved = f.read(receipt.entryId, "21").snapshot;
    assert.equal(saved.libraryRevision, String(2 * i + 2));
    assert.equal(saved.recipe.title, `Version ${i}`);
    assert.equal(saved.recipe.ingredients[0].quantity, `${i + 1}/2`);
    assert.equal(saved.recipe.ingredients[1].quantity, "250");
  }
  assert.equal(f.db.sql("select count(*) from public.grocery_items"), "1");
});
test("legacy locks and library changes conflict without partial selection", async (t) => {
  const f = fixture(t);
  for (const sql of [
    `select id from public.meal_definitions where id='${id(200)}' for update`,
    `select id from public.meal_grocery_templates where id='${id(300)}' for update`,
    `update public.meal_grocery_templates set quantity='9' where id='${id(300)}'`,
  ]) {
    const held = f.db.concurrent(
      `set application_name='recipe-selection-lock'; begin; ${sql}; select pg_sleep(0.7); commit`,
    );
    for (let attempt = 0; ; attempt++) {
      if (
        f.db.sql(
          "select count(*) from pg_stat_activity where application_name='recipe-selection-lock' and wait_event='PgSleep'",
        ) === "1"
      )
        break;
      assert.ok(attempt < 150);
      await setTimeout(5);
    }
    assert.throws(() => f.db.sql(`set lock_timeout='30ms'; ${command(id(800))}`), /changed/);
    await held;
    assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "0");
    assert.equal(f.db.sql("select count(*) from public.nest_recipe_selection_receipts"), "0");
  }
  assert.throws(() => f.select(id(800)), /changed/);
  const saved = f.select(id(800), input({ expectedLibraryRevision: "1" }));
  assert.equal(f.read(saved.entryId, "1").snapshot.recipe.ingredients[0].quantity, "9");
  assert.throws(
    () =>
      f.db.sql(
        `begin isolation level repeatable read; ${command(id(801), input({ slot: "lunch", expectedRevision: "1", expectedLibraryRevision: "1" }))}; commit`,
      ),
    /changed/,
  );
});
test("legacy long titles and 200 ingredients are captured without truncation; larger recipes reject atomically", (t) => {
  const f = fixture(t),
    title = "🫕".repeat(120);
  f.db.sql(`update public.meal_definitions set name='${title}' where id='${id(200)}';
  insert into public.meal_grocery_templates(household_id,meal_definition_id,name,quantity,unit,sort_order)
   select '${id(10)}','${id(200)}','Ingredient '||i,'1/2','cup',i+1 from generate_series(2,199) i`);
  const saved = f.select(id(800), input({ expectedLibraryRevision: "199" }));
  const recipe = f.read(saved.entryId, "1").snapshot.recipe;
  assert.equal(recipe.title, title);
  assert.equal(recipe.ingredients.length, 200);
  f.db.sql(
    `insert into public.meal_grocery_templates(household_id,meal_definition_id,name,sort_order) values('${id(10)}','${id(200)}','Extra',999)`,
  );
  const before = f.snapshot();
  assert.throws(
    () =>
      f.select(
        id(801),
        input({ slot: "lunch", expectedRevision: "1", expectedLibraryRevision: "200" }),
      ),
    /ingredient count/,
  );
  assert.deepEqual(f.snapshot(), before);
});
test("week overflow rolls back selection and replacement refuses active leftover dependents", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into public.nest_meal_week_revisions(household_id,week_start,revision) values('${id(10)}','${week}',9223372036854775807)`,
  );
  const before = f.snapshot();
  assert.throws(
    () => f.select(id(800), input({ expectedRevision: "9223372036854775807" })),
    /changed/,
  );
  assert.deepEqual(f.snapshot(), before);
  f.db.sql(`update public.nest_meal_week_revisions set revision=0`);
  const saved = f.select(id(800));
  f.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(10)}','2030-01-08','dinner','Leftovers','${saved.entryId}')`,
  );
  const prior = f.snapshot();
  assert.throws(
    () => f.select(id(801), input({ entryId: saved.entryId, expectedRevision: "2" }), true),
    /leftover|changed/i,
  );
  assert.deepEqual(f.snapshot(), prior);
});
test("moves preserve snapshots; remove retains historical recipe but current detail disappears", (t) => {
  const f = fixture(t),
    saved = f.select(id(800)),
    recipe = f.read(saved.entryId, "1").snapshot;
  const move = {
    entryId: saved.entryId,
    sourceWeekStart: week,
    targetWeekStart: week,
    expectedSourceRevision: "1",
    expectedTargetRevision: "1",
    date: "2030-01-08",
    slot: "lunch",
  };
  const moved = JSON.parse(
    f.db.sql(as(`select public.nest_move_meal('${id(10)}','${id(801)}',${json(move)})`)),
  );
  assert.deepEqual(f.read(saved.entryId, moved.targetRevision).snapshot, recipe);
  const removed = f.remove(id(802), {
    entryId: saved.entryId,
    weekStart: week,
    expectedRevision: moved.targetRevision,
  });
  assert.equal(f.read(saved.entryId, removed.revision).entry, null);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "1");
  assert.deepEqual(f.select(id(800)), saved);
});
