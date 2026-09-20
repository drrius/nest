import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import { CreateRecipeInput } from "../../packages/contracts/src/recipe-creation.ts";
import { fixture, id, input, command } from "./recipe-creation-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const patchRecipe = (patch) => ({ ...input(), recipe: { ...input().recipe, ...patch } });
const patchIngredient = (patch) =>
  patchRecipe({ ingredients: [{ ...input().recipe.ingredients[0], ...patch }] });

const sourceCases = () =>
  [
    null,
    "",
    "http://example.com",
    "HTTPS://example.com/path?q=1#steps",
    "https://example.com/path@name",
    "https://example.com:8080/a",
    "https://[::1]/recipe",
    "javascript:alert(1)",
    "//example.com",
    "https://user:secret@example.com",
    "https://example.com\\path",
    "https://example.com/ a",
    "https://example.com/\u00a0",
    "https://example.com/\u0085",
    "https://example.com/\u007f",
    "https://example.com/\u0001",
    "https://example.com/\ufeff",
    "https://example.com/\n",
  ].map((recipeUrl) => patchRecipe({ recipeUrl }));

test("Effect and PostgreSQL agree on creation text, source, ingredient, identity and exact revision boundaries", (t) => {
  const f = fixture(t);
  const values = [
    null,
    [],
    {},
    input(),
    { ...input(), operationId: id(700) },
    { ...input(), householdId: id(20) },
  ];
  for (let n = 0; n <= 124; n++)
    values.push(patchRecipe({ title: (n % 2 ? "🥣" : "a").repeat(n) }));
  for (const servings of [null, "2", 0, -1, 1.5, 2147483647, 2147483648])
    values.push(patchRecipe({ servings }));
  for (const expectedRevision of [
    null,
    0,
    "01",
    "-1",
    "9223372036854775804",
    "9223372036854775805",
    "9223372036854775808",
    "0\n",
  ])
    values.push({ ...input(), expectedRevision });
  for (const text of [
    null,
    "",
    "\t\n",
    "\u00a0",
    "\u0085",
    "\ufeff",
    "a".repeat(4000),
    "a".repeat(4001),
    "🥣".repeat(2000),
    "🥣".repeat(2001),
  ])
    values.push(patchRecipe({ instructions: text }));
  values.push(...sourceCases());
  for (const patch of [
    { categoryId: 1 },
    { categoryId: id(400).toUpperCase() },
    { categoryId: "bad" },
    { ingredientId: id(800) },
    { name: " " },
    { quantity: "a".repeat(80) },
    { quantity: "a".repeat(81) },
    { quantity: "" },
    { unit: null },
    { note: "a".repeat(1000) },
    { note: "a".repeat(1001) },
  ])
    values.push(patchIngredient(patch));
  for (const ingredients of [null, [], Array(201).fill(input().recipe.ingredients[0])])
    values.push(patchRecipe({ ingredients }));
  for (const key of Object.keys(input().recipe)) {
    const value = input();
    delete value.recipe[key];
    values.push(value);
  }
  const expected = values.map(
    (value) =>
      Schema.decodeUnknownExit(CreateRecipeInput)(value, { onExcessProperty: "error" })._tag ===
      "Success",
  );
  f.db.sql(
    "create function private.fixture_recipe_valid(value jsonb) returns boolean language plpgsql as $$ begin perform private.nest_recipe_creation_input(value); return true; exception when others then return false; end $$",
  );
  const actual = JSON.parse(
    f.db.sql(
      `select jsonb_agg(private.fixture_recipe_valid(value) order by ordinal) from jsonb_array_elements('${JSON.stringify(values).replaceAll("'", "''")}') with ordinality as items(value,ordinal)`,
    ),
  );
  for (let n = 0; n < values.length; n++)
    assert.equal(
      actual[n],
      expected[n],
      `Boundary ${n}: ${JSON.stringify(values[n]).slice(0, 300)}`,
    );
});

async function waitFor(db, application) {
  for (let n = 0; n < 150; n++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and wait_event='PgSleep'`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing lock barrier ${application}`);
}

test("legacy definition changes holding the revision serialize creation and stale retries cannot overwrite them", async (t) => {
  const f = fixture(t);
  const held = f.db.concurrent(
    `set application_name='recipe-legacy'; begin; update public.meal_definitions set name='Partner edit' where id='${id(200)}'; select pg_sleep(0.7); commit`,
  );
  await waitFor(f.db, "recipe-legacy");
  assert.throws(
    () => f.db.sql(`set lock_timeout='30ms'; ${command(id(710))}`),
    /Meal library changed/,
  );
  await held;
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "0");
  assert.equal(f.db.sql("select count(*) from public.meal_definitions"), "3");
  assert.throws(() => f.create(id(710)), /Meal library changed/);
  assert.equal(f.create(id(710), input("1")).revision, "4");
});

test("category locking prevents creation from using an ingredient category being archived", async (t) => {
  const f = fixture(t),
    request = input(),
    before = f.snapshot();
  request.recipe.ingredients[0].categoryId = id(400);
  const held = f.db.concurrent(
    `set application_name='recipe-category'; begin; select id from public.grocery_categories where id='${id(400)}' for update; select pg_sleep(0.7); update public.grocery_categories set archived_at=now() where id='${id(400)}'; commit`,
  );
  await waitFor(f.db, "recipe-category");
  assert.throws(() => f.create(id(720), request), /Meal library changed/);
  assert.deepEqual(f.snapshot(), before);
  await held;
  assert.throws(() => f.create(id(720), request), /Ingredient category changed/);
  assert.deepEqual(f.snapshot(), before);
});
