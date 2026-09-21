import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import {
  fixture,
  input,
  id,
  existing,
  added,
  command,
  EditRecipeInput,
  Schema,
} from "./recipe-edit-fixture.mjs";

test("shared edit schema and SQL reject hidden fields, invalid text, duplicate targets and missing intent", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  const invalid = [
    { ...input(), actorId: id(2) },
    { ...input(), operationId: id(999) },
    { ...input(), householdId: id(20) },
    { ...input(), definitionId: "invalid" },
    input("01"),
    input("9223372036854775808"),
    input("0", {}),
    input("0", { title: null }),
    input("0", { title: " " }),
    input("0", { title: "😀".repeat(61) }),
    input("0", { notes: "\u2009" }),
    input("0", { instructions: "" }),
    input("0", { servings: 1.5 }),
    input("0", { servings: "2" }),
    input("0", { servings: 2147483648 }),
    input("0", { recipeUrl: "javascript:bad" }),
    input("0", { recipeUrl: "https://example.com/\u0080" }),
    input("0", { archived_at: null }),
    input("0", {}, [existing(300), existing(300)]),
    input("0", {}, [{ ...existing(300), extra: true }]),
    input("0", {}, [existing(300, { ingredientId: id(301) })]),
    input("0", {}, [{ ...added(), ingredientId: id(300) }]),
    input("0", {}, [added({ quantity: " " })]),
    input(
      "0",
      {},
      Array.from({ length: 201 }, () => added()),
    ),
  ];
  for (const value of invalid) {
    assert.throws(() =>
      Schema.decodeUnknownSync(EditRecipeInput)(value, { onExcessProperty: "error" }),
    );
    assert.throws(() => f.edit(id(800), value), /Invalid/);
    assert.deepEqual(f.snapshot(), before);
  }
});
test("reorder/edit sequences preserve identities, quantities and immutable history across multiple revisions", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  let revision = "0";
  for (let iteration = 0; iteration < 8; iteration++) {
    const order = iteration % 2 ? [301, 300] : [300, 301];
    const selection = order.map((n) => existing(n, { note: `Pass ${iteration}` }));
    selection.splice(
      iteration % 3,
      0,
      added({ name: "Tomatoes", quantity: String(iteration + 1), unit: "g" }),
    );
    const receipt = f.edit(id(800 + iteration), input(revision, {}, selection));
    assert.equal(receipt.previousRevision, revision);
    assert.ok(BigInt(receipt.revision) > BigInt(revision));
    revision = receipt.revision;
    const recipe = f.recipe(id(200), revision).recipe;
    assert.equal(recipe.ingredients.length, 3);
    const tomato = recipe.ingredients.find((item) => item.ingredientId === id(300));
    const grams = recipe.ingredients.find((item) => item.ingredientId === id(301));
    assert.equal(tomato.quantity, "1/2");
    assert.equal(tomato.unit, "cup");
    assert.equal(grams.quantity, "250");
    assert.equal(grams.unit, "g");
    assert.deepEqual(
      recipe.ingredients.map((item) => item.order),
      [0, 1, 2],
    );
    assert.equal(
      f.db.sql(
        `select count(*) from public.meal_grocery_templates where meal_definition_id='${id(200)}'`,
      ),
      String(3 + iteration),
    );
  }
  for (const table of ["meal_plan_entries", "grocery_items", "nest_meal_week_revisions"])
    assert.equal(f.snapshot()[table], before[table]);
});
test("maximum replacement reaches exact int64 limit; no-op succeeds there and overflow rolls back", (t) => {
  const f = fixture(t);
  f.db
    .sql(`insert into public.meal_grocery_templates(household_id,meal_definition_id,name,sort_order)
    select '${id(10)}','${id(200)}','Old ingredient',n from generate_series(2,199) n;
    update public.nest_meal_library_revisions set revision=9223372036854775406 where household_id='${id(10)}'`);
  const receipt = f.edit(
    id(800),
    input(
      "9223372036854775406",
      { title: "Full replacement" },
      Array.from({ length: 200 }, () => added()),
    ),
  );
  assert.equal(receipt.revision, "9223372036854775807");
  assert.equal(f.recipe(id(200), receipt.revision).recipe.ingredients.length, 200);
  assert.equal(
    f.db.sql(
      `select count(*) from public.meal_grocery_templates where meal_definition_id='${id(200)}' and archived_at is not null`,
    ),
    "200",
  );
  const unchanged = f.edit(id(801), input(receipt.revision, { title: "Full replacement" }));
  assert.equal(unchanged.revision, receipt.revision);
  assert.equal(unchanged.previousRevision, receipt.revision);
  const before = f.snapshot();
  assert.throws(() => f.edit(id(802), input(receipt.revision)), /library changed/);
  assert.deepEqual(f.snapshot(), before);
});
test("unchanged legacy astral text and archived category survive unrelated patches", (t) => {
  const f = fixture(t);
  f.db.sql(`update public.meal_definitions set name=repeat('😀',120) where id='${id(200)}';
    update public.meal_grocery_templates set name=repeat('😀',120),grocery_category_id='${id(402)}' where id='${id(300)}'`);
  const receipt = f.edit(
    id(800),
    input("2", { notes: "New note" }, [existing(300), existing(301)]),
  );
  const recipe = f.recipe(id(200), receipt.revision).recipe;
  assert.equal(recipe.title, "😀".repeat(120));
  assert.equal(recipe.ingredients[0].name, "😀".repeat(120));
  assert.equal(recipe.ingredients[0].categoryId, id(402));
  const before = f.snapshot();
  assert.throws(
    () =>
      f.edit(
        id(801),
        input(receipt.revision, {}, [existing(300, { categoryId: id(402) }), existing(301)]),
      ),
    /category changed/,
  );
  assert.deepEqual(f.snapshot(), before);
});
test("legacy row locks and revision races conflict without partial recipe edits", async (t) => {
  const f = fixture(t);
  for (const sql of [
    `select id from public.meal_definitions where id='${id(200)}' for update`,
    `select id from public.meal_grocery_templates where id='${id(300)}' for update`,
    `select id from public.grocery_categories where id='${id(400)}' for update`,
    `update public.meal_grocery_templates set quantity='9' where id='${id(300)}'`,
  ]) {
    const held = f.db.concurrent(
      `set application_name='recipe-edit-lock'; begin; ${sql}; select pg_sleep(0.7); commit`,
    );
    for (let attempt = 0; ; attempt++) {
      if (
        f.db.sql(
          "select count(*) from pg_stat_activity where application_name='recipe-edit-lock' and wait_event='PgSleep'",
        ) === "1"
      )
        break;
      assert.ok(attempt < 150);
      await setTimeout(5);
    }
    assert.throws(
      () =>
        f.db.sql(
          `set lock_timeout='30ms'; ${command(id(800), input("0", { title: "Rollback" }, [existing(300, { categoryId: id(400) }), existing(301)]))}`,
        ),
      /library changed/,
    );
    await held;
    assert.equal(
      f.db.sql(`select name from public.meal_definitions where id='${id(200)}'`),
      "Legacy soup",
    );
    assert.equal(f.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "0");
  }
  assert.throws(() => f.edit(id(800)), /library changed/);
  assert.equal(f.edit(id(800), input("1")).revision, "2");
  assert.throws(
    () =>
      f.db.sql(`begin isolation level repeatable read; ${command(id(801), input("2"))}; commit`),
    /library changed/,
  );
});
