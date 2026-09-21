import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, input, command } from "./recipe-archive-fixture.mjs";

test("archive hides library recipe while preserving ingredients and planned/grocery history; replay survives restoration", (t) => {
  const f = fixture(t),
    { db, archive } = f;
  db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,meal_definition_id,title_snapshot,recipe_url_snapshot) values('${id(10)}','2026-10-05','lunch','${id(200)}','Historical soup','https://example.com/old')`,
  );
  const before = f.snapshot();
  const result = archive(id(800));
  assert.equal(result.definitionId, id(200));
  assert.equal(result.revision, "1");
  const after = f.snapshot();
  for (const table of [
    "meal_grocery_templates",
    "meal_plan_entries",
    "nest_meal_week_revisions",
    "grocery_items",
  ])
    assert.equal(after[table], before[table]);
  assert.equal(
    f.page(null, "1").meals.some((meal) => meal.definitionId === id(200)),
    false,
  );
  assert.equal(f.recipe(id(200), "1").recipe, null);
  db.sql(
    `update public.meal_definitions set archived_at=null,name='Restored later' where id='${id(200)}'`,
  );
  assert.deepEqual(archive(id(800)), result);
  assert.equal(
    db.sql(`select archived_at is null from public.meal_definitions where id='${id(200)}'`),
    "t",
  );
  assert.throws(() => archive(id(800), input("2")), /operation changed/);
});
test("concurrent duplicate archives return one immutable receipt and competing member baseline conflicts", async (t) => {
  const { db, archive } = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => db.concurrent(command(id(800)))),
  );
  for (const result of results)
    assert.deepEqual(JSON.parse(result.stdout), JSON.parse(results[0].stdout));
  assert.equal(db.sql("select count(*) from public.nest_recipe_archive_receipts"), "1");
  assert.throws(() => archive(id(801), input(), id(2)), /library changed/);
  assert.throws(() => archive(id(802), input("1")), /Recipe changed/);
});
test("archive receipt failure rolls back archived state and revision", (t) => {
  const f = fixture(t),
    { db, archive } = f,
    before = f.snapshot();
  db.sql(`create function private.reject_archive() returns trigger language plpgsql as $$ begin raise exception 'Injected archive receipt failure'; end $$;
    create trigger reject_archive before insert on public.nest_recipe_archive_receipts for each row execute function private.reject_archive()`);
  assert.throws(() => archive(id(800)), /Injected archive receipt failure/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(db.sql("select count(*) from public.nest_recipe_archive_receipts"), "0");
});
test("archive checks authorization before replay and rejects foreign definitions and direct receipt writes", (t) => {
  const { db, archive } = fixture(t);
  assert.throws(() => archive(id(800), input("0", id(202))), /Recipe changed/);
  assert.throws(() => archive(id(800), input(), id(3)), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_archive_recipe('${id(10)}','${id(800)}','{}')`),
    /permission denied/,
  );
  archive(id(800));
  assert.equal(db.sql(as("select count(*) from public.nest_recipe_archive_receipts", id(2))), "0");
  assert.throws(
    () => db.sql(as("delete from public.nest_recipe_archive_receipts")),
    /permission denied/,
  );
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => archive(id(800)), /Not authorized/);
});
test("archive exact bigint capacity, snapshot isolation and strict inputs cannot bypass guards", (t) => {
  const { db, archive } = fixture(t);
  for (const patch of [
    { actorId: id(2) },
    { expectedRevision: 0 },
    { expectedRevision: "01" },
    { expectedRevision: "9223372036854775807" },
    { definitionId: null },
  ])
    assert.throws(() => archive(id(800), { ...input(), ...patch }), /Invalid/);
  assert.throws(
    () => db.sql(`begin isolation level repeatable read; ${command(id(800))}; commit`),
    /library changed/,
  );
  db.sql(`insert into public.nest_meal_library_revisions values('${id(10)}',9223372036854775806)`);
  const receipt = archive(id(800), input("9223372036854775806"));
  assert.equal(receipt.revision, "9223372036854775807");
  assert.deepEqual(archive(id(800), input("9223372036854775806")), receipt);
});

test("archive conflicts with a legacy row lock and a concurrent ingredient revision without partial changes", async (t) => {
  const { db, archive } = fixture(t);
  for (const [n, sql] of [
    [0, `select id from public.meal_definitions where id='${id(200)}' for update`],
    [1, `update public.meal_grocery_templates set quantity='9' where id='${id(300)}'`],
  ]) {
    const held = db.concurrent(
      `set application_name='recipe-archive-lock'; begin; ${sql}; select pg_sleep(0.7); commit`,
    );
    for (let attempt = 0; ; attempt++) {
      if (
        db.sql(
          "select count(*) from pg_stat_activity where application_name='recipe-archive-lock' and wait_event='PgSleep'",
        ) === "1"
      )
        break;
      assert.ok(attempt < 150);
      await setTimeout(5);
    }
    assert.throws(
      () => db.sql(`set lock_timeout='30ms'; ${command(id(810 + n))}`),
      /Meal library changed/,
    );
    await held;
    assert.equal(db.sql("select count(*) from public.nest_recipe_archive_receipts"), "0");
    assert.equal(
      db.sql(`select archived_at is null from public.meal_definitions where id='${id(200)}'`),
      "t",
    );
  }
  assert.throws(() => archive(id(812)), /Meal library changed/);
  assert.equal(archive(id(812), input("1")).revision, "2");
});
