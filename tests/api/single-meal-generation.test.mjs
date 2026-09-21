import assert from "node:assert/strict";
import { test } from "node:test";
import { input, model, run, id, recipe } from "./single-meal-generation-fixture.mjs";

test("replacement targets exactly one slot, retains its identity and leaves all other preview entries unchanged", async () => {
  const value = input(),
    before = structuredClone(value),
    provider = model(),
    entry = await run(provider, value);
  assert.equal(provider.calls.length, 2);
  assert.equal(entry.entryId, id(501));
  assert.equal(entry.date, "2030-01-08");
  assert.equal(entry.slot, "dinner");
  assert.deepEqual(entry.source.recipe, recipe);
  assert.equal(entry.source.libraryRevision, value.planning.library.revision);
  assert.deepEqual(value, before);
  assert.deepEqual(provider.calls[0].data.slots, [{ date: entry.date, slot: entry.slot }]);
  assert.equal(provider.calls[0].data.otherMeals.length, 6);
  assert.equal(provider.calls[1].data.meals.length, 1);
  assert.equal(provider.calls[0].data.requesterCalorieGoal, 1900);
  assert.equal(provider.calls[1].data.requesterCalorieGoal, undefined);
  for (const call of provider.calls)
    for (const privateValue of [id(1), id(2), id(10), id(800), "a".repeat(64)])
      assert.equal(JSON.stringify(call.data).includes(privateValue), false);
});

test("favorite selection checks the exact authorized recipe once without rewriting it or carrying a previous calorie estimate", async () => {
  const value = input(),
    provider = model();
  value.selection = id(200);
  const entry = await run(provider, value);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].data.slots, undefined);
  assert.deepEqual(provider.calls[0].data.meals[0].recipe, recipe);
  assert.deepEqual(entry.source.recipe, recipe);
  assert.equal(entry.estimatedCaloriesPerServing, null);
});

test("foreign, stale, expired, terminal and missing target evidence fails before provider spending", async () => {
  for (const change of [
    (v) => {
      v.envelope.actorId = id(2);
    },
    (v) => {
      v.envelope.householdId = id(20);
    },
    (v) => {
      v.envelope.proposal.weekRevision = "1";
    },
    (v) => {
      v.envelope.proposal.expiresAt = Date.now() - 1;
    },
    (v) => {
      v.envelope.proposal.status = "approved";
    },
    (v) => {
      v.entryId = id(999);
    },
    (v) => {
      v.approved = true;
    },
    (v) => {
      v.planning.context.members[1].profile = null;
    },
    (v) => {
      v.selection = id(999);
    },
    (v) => {
      v.planning.week.entries.push({
        entryId: id(900),
        date: "2030-01-08",
        slot: "dinner",
        title: "Occupied",
        recipeUrl: null,
        notes: null,
        definitionId: null,
        leftoverSourceId: null,
      });
    },
  ]) {
    const value = input(),
      provider = model();
    change(value);
    await assert.rejects(run(provider, value));
    assert.equal(provider.calls.length, 0);
  }
});

test("additional or different generated slots cannot rewrite the rest of the week", async () => {
  for (const change of [
    (value) => ({ meals: [value.meals[0], { ...value.meals[0], date: "2030-01-09" }] }),
    (value) => ({ meals: value.meals.map((meal) => ({ ...meal, slot: "lunch" })) }),
    (value) => ({
      meals: value.meals.map((meal) => ({
        ...meal,
        choice: { kind: "saved", definitionId: id(999) },
      })),
    }),
  ]) {
    const provider = model((v, n) => (n === 1 ? change(v) : v));
    await assert.rejects(run(provider));
    assert.equal(provider.calls.length, 1);
  }
});

test("both generated and explicitly chosen replacements require an exact safe constraint check", async () => {
  for (const selection of [null, id(200)])
    for (const result of ["unsafe", "unknown"]) {
      const value = input();
      value.selection = selection;
      const provider = model((v) =>
        v.checks ? { checks: v.checks.map((check) => ({ ...check, result })) } : v,
      );
      await assert.rejects(run(provider, value), { reason: "no_suitable_meals" });
    }
  const provider = model((v) =>
    v.checks ? { checks: v.checks.map((check) => ({ ...check, date: "2030-01-09" })) } : v,
  );
  await assert.rejects(run(provider), { reason: "no_suitable_meals" });
});

test("the previous saved meal cannot be returned as its replacement, and familiar-only never accepts new suggestions", async () => {
  const value = input();
  value.planning.library.recipes.push(value.envelope.proposal.entries[1].source.recipe);
  value.selection = id(201);
  const chosen = model();
  await assert.rejects(run(chosen, value), { reason: "no_suitable_meals" });
  assert.equal(chosen.calls.length, 0);
  value.selection = null;
  const repeated = model((v) =>
    v.meals
      ? { meals: v.meals.map((m) => ({ ...m, choice: { kind: "saved", definitionId: id(201) } })) }
      : v,
  );
  await assert.rejects(run(repeated, value), { reason: "no_suitable_meals" });
  value.planning.familiarOnly = value.envelope.proposal.familiarOnly = true;
  const { definitionId: _id, ingredients, ...body } = recipe;
  const draft = {
    ...body,
    ingredients: ingredients.map(({ ingredientId: _ingredient, order: _order, ...item }) => item),
  };
  const suggested = model((v) =>
    v.meals
      ? { meals: v.meals.map((m) => ({ ...m, choice: { kind: "suggested", recipe: draft } })) }
      : v,
  );
  await assert.rejects(run(suggested, value), { reason: "no_suitable_meals" });
  assert.equal(suggested.calls.length, 1);
});

test("provider failure is finite and cancellation stops the edit without mutating the preview", async () => {
  const value = input(),
    before = structuredClone(value);
  const failed = model(() => {
    throw new Error("private provider details");
  });
  await assert.rejects(run(failed, value), (error) => {
    assert.equal(error.reason, "unavailable");
    assert.equal(JSON.stringify(error).includes("private provider"), false);
    return true;
  });
  const controller = new AbortController();
  const cancelled = model(
    (_v, _n, _data, options) =>
      new Promise((_resolve, reject) => {
        options.abortSignal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        });
        controller.abort();
      }),
  );
  await assert.rejects(run(cancelled, value, { signal: controller.signal }));
  assert.equal(cancelled.calls.length, 1);
  assert.deepEqual(value, before);
});

test("complete new suggestions retain the target identity while oversized favorite review fails before spending", async () => {
  const { definitionId: _id, ingredients, ...body } = recipe;
  const draft = {
    ...body,
    title: "New stew",
    ingredients: ingredients.map(({ ingredientId: _ingredient, order: _order, ...item }) => item),
  };
  const provider = model((v) =>
    v.meals
      ? {
          meals: v.meals.map((meal) => ({ ...meal, choice: { kind: "suggested", recipe: draft } })),
        }
      : v,
  );
  const replacement = await run(provider);
  assert.equal(replacement.entryId, id(501));
  assert.deepEqual(replacement.source, { kind: "suggested", recipe: draft });
  const value = input(),
    oversized = model();
  value.selection = id(200);
  value.planning.library.recipes[0].ingredients = Array.from({ length: 200 }, (_, n) => ({
    ...structuredClone(recipe.ingredients[0]),
    ingredientId: id(1000 + n),
    order: n,
    note: "x".repeat(1000),
  }));
  await assert.rejects(run(oversized, value), { reason: "unavailable" });
  assert.equal(oversized.calls.length, 0);
});
