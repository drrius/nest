import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, as, pageSql, recipeSql } from "./meal-library-fixture.mjs";

async function waitFor(db, application, event) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and wait_event='${event}'`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing barrier ${application}/${event}`);
}

test("a blocked library read retains one revision, definition and ingredient snapshot across a concurrent commit", async (t) => {
  const f = fixture(t),
    before = { page: f.page(), detail: f.recipe() };
  const holder = f.db.concurrent(
    "set application_name='library-holder'; begin; select pg_advisory_xact_lock(7752); select pg_sleep(0.8); commit",
  );
  await waitFor(f.db, "library-holder", "PgSleep");
  const reading = f.db.concurrent(
    as(`set application_name='library-reader';
    with barrier as materialized(select pg_advisory_xact_lock(7752))
    select jsonb_build_object('page',(${pageSql()}),'detail',(${recipeSql()})) from barrier`),
  );
  await waitFor(f.db, "library-reader", "advisory");
  f.db.sql(
    as(
      `begin; update public.meal_definitions set name='New soup' where id='${id(200)}'; update public.meal_grocery_templates set quantity='3' where id='${id(300)}'; commit`,
    ),
  );
  await holder;
  assert.deepEqual(JSON.parse((await reading).stdout.trim()), before);
  const after = f.recipe(id(200), "2");
  assert.equal(after.recipe.title, "New soup");
  assert.equal(after.recipe.ingredients[0].quantity, "3");
});

test("concurrent legacy definition and ingredient updates retain every monotonic revision increment", async (t) => {
  const f = fixture(t);
  const changes = [
    `update public.meal_definitions set name='Changed' where id='${id(200)}'`,
    `update public.meal_definitions set name='Second changed' where id='${id(201)}'`,
    `update public.meal_grocery_templates set quantity='3' where id='${id(300)}'`,
    `update public.meal_grocery_templates set unit='kg' where id='${id(301)}'`,
  ];
  await Promise.all(changes.map((sql, index) => f.db.concurrent(as(sql, id((index % 2) + 1)))));
  assert.equal(f.page().revision, "4");
  const detail = f.recipe(id(200), "4");
  assert.equal(detail.recipe.title, "Changed");
  assert.equal(detail.recipe.ingredients[0].quantity, "3");
  assert.equal(detail.recipe.ingredients[1].unit, "kg");
});

test("administrative reassignment advances both libraries and household cascade never recreates revision rows", (t) => {
  const f = fixture(t);
  f.db.sql(`update public.meal_definitions set household_id='${id(20)}' where id='${id(201)}'`);
  assert.equal(f.page().revision, "1");
  assert.equal(
    f.db.sql(
      `select revision from public.nest_meal_library_revisions where household_id='${id(20)}'`,
    ),
    "1",
  );
  assert.equal(f.recipe(id(201), "1").recipe, null);
  f.db.sql(`delete from public.households where id='${id(20)}'`);
  assert.equal(
    f.db.sql(
      `select count(*) from public.nest_meal_library_revisions where household_id='${id(20)}'`,
    ),
    "0",
  );
  assert.equal(f.page().revision, "1");
});
