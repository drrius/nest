import assert from "node:assert/strict";
import { test } from "node:test";
import { input, model, run, id, recipe } from "./meal-generation-fixture.mjs";

test("structured SDK generation fills only configured empty slots with canonical saved recipes and private constraint checks", async () => {
  const value = input();
  value.week.entries = [
    {
      entryId: id(400),
      date: "2030-01-07",
      slot: "dinner",
      title: "Existing dinner",
      recipeUrl: null,
      notes: null,
      definitionId: null,
      leftoverSourceId: null,
    },
  ];
  const f = model(),
    content = await run(f, value);
  assert.equal(f.calls.length, 2);
  assert.equal(content.entries.length, 6);
  assert.equal(content.entries[0].date, "2030-01-08");
  assert.equal(new Set(content.entries.map((entry) => entry.entryId)).size, 6);
  for (const entry of content.entries) {
    assert.equal(entry.slot, "dinner");
    assert.deepEqual(entry.source.recipe, recipe);
    assert.equal(entry.source.libraryRevision, value.library.revision);
    assert.equal(entry.estimatedCaloriesPerServing, 300);
  }
  assert.deepEqual(
    f.calls[0].data.members.map((member) => member.restrictions),
    [["No peanuts"], ["Vegetarian"]],
  );
  assert.equal(f.calls[0].data.requesterCalorieGoal, 1900);
  for (const { data } of f.calls) {
    const text = JSON.stringify(data);
    for (const privateValue of [id(1), id(2), id(10), "a".repeat(64)])
      assert.equal(text.includes(privateValue), false);
  }
  assert.equal(JSON.stringify(content).includes("1900"), false);
  assert.equal(f.calls[1].data.requesterCalorieGoal, undefined);
  assert.ok(
    f.calls[0].data.availability.every((day) =>
      day.members.every((member) => member.status === "unknown"),
    ),
  );
});

test("missing setup, foreign evidence, malformed inputs and a full week fail before provider spending", async () => {
  const missing = input();
  missing.context.members[1].profile = null;
  const cooking = input();
  cooking.context.cooking = null;
  const foreign = input();
  foreign.week.householdId = id(20);
  const duplicate = input();
  duplicate.library.recipes.push(recipe);
  const familiar = input();
  familiar.familiarOnly = true;
  familiar.library.recipes = [];
  const full = input();
  full.week.entries = Array.from({ length: 7 }, (_, n) => ({
    entryId: id(400 + n),
    date: `2030-01-${String(7 + n).padStart(2, "0")}`,
    slot: "dinner",
    title: "Existing",
    recipeUrl: null,
    notes: null,
    definitionId: null,
    leftoverSourceId: null,
  }));
  for (const [value, reason] of [
    [missing, "incomplete_preferences"],
    [cooking, "incomplete_preferences"],
    [foreign, "unavailable"],
    [duplicate, "unavailable"],
    [familiar, "no_suitable_meals"],
    [full, "week_full"],
  ]) {
    const f = model();
    await assert.rejects(run(f, value), { reason });
    assert.equal(f.calls.length, 0);
  }
});

test("incomplete, duplicate and invented slots and unauthorized saved definitions are rejected before constraint review", async () => {
  for (const change of [
    (v) => ({ meals: v.meals.slice(1) }),
    (v) => ({ meals: [v.meals[0], ...v.meals.slice(0, -1)] }),
    (v) => ({ meals: v.meals.map((meal) => ({ ...meal, date: "2030-01-14" })) }),
    (v) => ({
      meals: v.meals.map((meal) => ({ ...meal, choice: { kind: "saved", definitionId: id(999) } })),
    }),
    (v) => ({ ...v, approved: true }),
    (v) => ({ meals: v.meals.map((meal) => ({ ...meal, choice: { ...meal.choice, recipe } })) }),
  ]) {
    const f = model(change);
    await assert.rejects(run(f));
    assert.equal(f.calls.length, 1);
  }
  const incomplete = input();
  incomplete.library.recipes[0].instructions = null;
  const f = model();
  await assert.rejects(run(f, incomplete), { reason: "no_suitable_meals" });
  assert.equal(f.calls.length, 1);
});

test("constraint review must explicitly cover every exact meal as safe; unsafe, unknown and incomplete reviews fail closed", async () => {
  for (const change of [
    (v) => ({ checks: v.checks.slice(1) }),
    (v) => ({ checks: [v.checks[0], ...v.checks.slice(0, -1)] }),
    (v) => ({ checks: v.checks.map((check) => ({ ...check, result: "unsafe" })) }),
    (v) => ({ checks: v.checks.map((check) => ({ ...check, result: "unknown" })) }),
    (v) => ({ checks: v.checks.map((check) => ({ ...check, date: "2030-01-14" })) }),
  ]) {
    const f = model((v, n) => (n === 2 ? change(v) : v));
    await assert.rejects(run(f), { reason: "no_suitable_meals" });
    assert.equal(f.calls.length, 2);
  }
});

test("new suggestions retain full recipes but familiar-only generation, invented links and category IDs are denied", async () => {
  const { definitionId: _id, ingredients, ...body } = recipe;
  const suggested = {
    ...body,
    ingredients: ingredients.map(({ ingredientId: _ingredient, order: _order, ...rest }) => rest),
  };
  const choices = (v) => ({
    meals: v.meals.map((meal) => ({ ...meal, choice: { kind: "suggested", recipe: suggested } })),
  });
  const f = model((v, n) => (n === 1 ? choices(v) : v));
  const content = await run(f);
  assert.deepEqual(content.entries[0].source, { kind: "suggested", recipe: suggested });
  const familiar = input();
  familiar.familiarOnly = true;
  const rejected = model((v, n) => (n === 1 ? choices(v) : v));
  await assert.rejects(run(rejected, familiar), { reason: "no_suitable_meals" });
  assert.equal(rejected.calls.length, 1);
  for (const patch of [
    { recipeUrl: "https://invented.example/recipe" },
    {
      ingredients: suggested.ingredients.map((ingredient) => ({
        ...ingredient,
        categoryId: id(900),
      })),
    },
  ]) {
    const bad = model((v) => ({
      meals: choices(v).meals.map((meal) => ({
        ...meal,
        choice: { kind: "suggested", recipe: { ...suggested, ...patch } },
      })),
    }));
    await assert.rejects(run(bad), { reason: "unavailable" });
    assert.equal(bad.calls.length, 1);
  }
});
