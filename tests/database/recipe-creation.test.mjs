import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, command, input } from "./recipe-creation-fixture.mjs";

test("recipe creation retains ordered distinct quantities, metadata and immutable replay without plan or grocery effects", (t) => {
  const f = fixture(t),
    before = f.snapshot(),
    request = input();
  request.recipe.ingredients[0].categoryId = id(400);
  const receipt = f.create(id(600), request),
    saved = f.recipe(receipt.definitionId, "3").recipe;
  assert.equal(receipt.revision, "3");
  assert.equal(receipt.actorId, id(1));
  assert.equal(receipt.householdId, id(10));
  assert.equal(receipt.operationId, id(600));
  assert.equal(saved.title, request.recipe.title);
  assert.equal(saved.instructions, request.recipe.instructions);
  assert.equal(saved.servings, 2);
  assert.equal(saved.notes, request.recipe.notes);
  assert.equal(saved.recipeUrl, request.recipe.recipeUrl);
  assert.deepEqual(
    saved.ingredients.map(({ ingredientId, order, ...item }) => {
      assert.ok(ingredientId);
      assert.ok(order >= 0);
      return item;
    }),
    request.recipe.ingredients,
  );
  assert.deepEqual(
    saved.ingredients.map((item) => item.order),
    [0, 1],
  );
  assert.notEqual(saved.ingredients[0].ingredientId, saved.ingredients[1].ingredientId);
  const after = f.snapshot();
  for (const table of ["meal_plan_entries", "nest_meal_week_revisions", "grocery_items"])
    assert.equal(after[table], before[table]);
  f.db.sql(
    as(
      `update public.meal_definitions set name='Partner title',archived_at=now() where id='${receipt.definitionId}'`,
      id(2),
    ),
  );
  assert.deepEqual(f.create(id(600), request), receipt);
  assert.equal(f.recipe(receipt.definitionId, "4").recipe, null);
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
  assert.throws(
    () =>
      f.create(id(600), { ...request, recipe: { ...request.recipe, title: "Changed request" } }),
    /operation changed/,
  );
});

test("five concurrent exact retries create one definition, one ingredient set and one actor-private receipt", async (t) => {
  const f = fixture(t);
  const replies = await Promise.all(
    Array.from({ length: 5 }, () => f.db.concurrent(command(id(610)))),
  );
  const results = replies.map((reply) => JSON.parse(reply.stdout));
  for (const value of results) assert.deepEqual(value, results[0]);
  assert.equal(f.db.sql("select count(*) from public.meal_definitions"), "4");
  assert.equal(f.db.sql("select count(*) from public.meal_grocery_templates"), "5");
  assert.equal(f.page().revision, "3");
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
});

test("competing partner recipes cannot silently share an obsolete library baseline", async (t) => {
  const f = fixture(t);
  const results = await Promise.allSettled([
    f.db.concurrent(command(id(620))),
    f.db.concurrent(command(id(621), input(), { actor: id(2) })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    results.find((result) => result.status === "rejected").reason.stderr,
    /Meal library changed/,
  );
  assert.equal(f.db.sql("select count(*) from public.meal_definitions"), "4");
  assert.equal(f.page().revision, "3");
});

test("ingredient failure and final receipt failure roll back the whole recipe, revision and every household effect", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  f.db.sql(
    "create function private.fixture_recipe_failure() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$",
  );
  for (const table of ["meal_grocery_templates", "nest_recipe_creation_receipts"]) {
    f.db.sql(
      `create trigger recipe_failure before insert on public.${table} for each row execute function private.fixture_recipe_failure()`,
    );
    assert.throws(() => f.create(id(630)), /fixture failure/);
    assert.deepEqual(f.snapshot(), before);
    f.db.sql(`drop trigger recipe_failure on public.${table}`);
  }
  assert.equal(f.create(id(630)).revision, "3");
});

test("current membership gates creation and receipt replay; other actors, tenants and direct writes cannot forge receipts", (t) => {
  const f = fixture(t);
  assert.throws(() => f.create(id(640), input(), { household: id(20) }), /Not authorized/);
  assert.throws(() => f.create(id(640), input(), { actor: id(3) }), /Not authorized/);
  assert.throws(
    () =>
      f.db.sql(`set role anon; select public.nest_create_recipe('${id(10)}','${id(640)}','{}')`),
    /permission denied/,
  );
  assert.throws(
    () =>
      f.db.sql(
        `set role authenticated; select public.nest_create_recipe('${id(10)}','${id(640)}','{}')`,
      ),
    /Not authorized/,
  );
  const receipt = f.create(id(640));
  assert.equal(
    f.db.sql(as("select count(*) from public.nest_recipe_creation_receipts", id(2))),
    "0",
  );
  assert.equal(
    f.db.sql(as("select count(*) from public.nest_recipe_creation_receipts", id(3))),
    "0",
  );
  assert.throws(
    () => f.db.sql(as("delete from public.nest_recipe_creation_receipts")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as(`select private.nest_insert_recipe('${id(10)}','{}')`)),
    /permission denied/,
  );
  assert.throws(() => f.create(id(640), input(), { actor: id(2) }), /Meal library changed/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.create(id(640)), /Not authorized/);
  assert.equal(f.db.sql(as("select count(*) from public.nest_recipe_creation_receipts")), "0");
  assert.equal(receipt.revision, "3");
});

test("foreign, archived and missing ingredient categories reject atomically; a maximum recipe retains all 200 ingredients", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  for (const categoryId of [id(401), id(402), id(999)]) {
    const request = input();
    request.recipe.ingredients[1].categoryId = categoryId;
    assert.throws(() => f.create(id(650), request), /Ingredient category changed/);
    assert.deepEqual(f.snapshot(), before);
  }
  const request = input();
  request.recipe.ingredients = Array.from({ length: 200 }, (_, n) => ({
    ...request.recipe.ingredients[0],
    quantity: String(n + 1),
  }));
  const receipt = f.create(id(650), request),
    saved = f.recipe(receipt.definitionId, "201").recipe;
  assert.equal(receipt.revision, "201");
  assert.equal(saved.ingredients.length, 200);
  assert.equal(saved.ingredients[199].quantity, "200");
  assert.equal(saved.ingredients[199].order, 199);
});

test("exact bigint capacity is reserved before creation and repeatable snapshots cannot authorize new writes", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  assert.throws(
    () => f.db.sql(`begin isolation level repeatable read; ${command(id(660))}; commit`),
    /Meal library changed/,
  );
  assert.deepEqual(f.snapshot(), before);
  f.db.sql(
    `insert into public.nest_meal_library_revisions values('${id(10)}',9223372036854775804)`,
  );
  const request = input("9223372036854775804"),
    receipt = f.create(id(660), request);
  assert.equal(receipt.revision, "9223372036854775807");
  assert.deepEqual(f.create(id(660), request), receipt);
  const full = f.snapshot();
  assert.throws(() => f.create(id(661), input("9223372036854775805")), /Invalid recipe creation/);
  assert.deepEqual(f.snapshot(), full);
});
