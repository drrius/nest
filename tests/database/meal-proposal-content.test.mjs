import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as, week, outcome, content } from "./meal-proposal-worker-fixture.mjs";
import { input } from "./meal-proposal-reservation-fixture.mjs";

const savedSource = (f) => {
  f.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const recipe = JSON.parse(
    f.db.sql(as(`select public.nest_saved_meal('${id(10)}','${id(200)}','${revision}')`)),
  ).recipe;
  return { kind: "saved", libraryRevision: revision, recipe };
};

test("fresh partner constraints, private goal, cooking choices, roster and week invalidate pending generation", (t) => {
  const f = fixture(t);
  const changes = [
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
    `update public.nest_food_profiles set calorie_goal=2500 where actor_id='${id(2)}'`,
    `update public.nest_cooking_preferences set cooking_notes='Changed'`,
    `update public.household_members set joined_at=joined_at+interval '1 second' where user_id='${id(2)}'`,
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(700)}','${id(10)}','${week}','dinner','Occupied')`,
  ];
  for (const [index, change] of changes.entries()) {
    const p = f.begin(id(800 + index)).proposalId;
    f.claim(p);
    f.db.sql(change);
    const result = f.finish(p);
    assert.equal(result.proposal.failure, "constraints_changed");
    assert.equal(result.proposal.entries, null);
    assert.equal(JSON.stringify(result).includes("2500"), false);
  }
});

test("malformed generated recipes and duplicate identities never publish, then a valid retry succeeds", (t) => {
  const f = fixture(t),
    p = f.begin(id(800)).proposalId;
  f.claim(p);
  const mutations = [
    (body) => {
      body.approved = true;
    },
    (body) => {
      body.weekStart = "2030-01-14";
    },
    (body) => {
      body.entries[0].source.recipe.instructions = "";
    },
    (body) => {
      body.entries[0].source.recipe.recipeUrl = "https://invented.invalid";
    },
    (body) => {
      body.entries[0].source.recipe.ingredients[0].categoryId = id(10);
    },
    (body) => {
      body.entries[0].estimatedCaloriesPerServing = 1.5;
    },
    (body) => {
      body.entries[0].date = "2030-02-30";
    },
    (body) => {
      body.entries[0].entryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      body.entries[1].entryId = body.entries[0].entryId.toUpperCase();
    },
    (body) => {
      body.entries[1].date = body.entries[0].date;
    },
    (body) => {
      delete body.entries[0].estimatedCaloriesPerServing;
    },
  ];
  for (const mutate of mutations) {
    const body = content();
    mutate(body);
    assert.throws(() => f.finish(p, outcome(body)), /Invalid|Duplicate/);
    assert.equal(f.read(p).proposal.revision, "1");
  }
  assert.equal(f.finish(p).proposal.status, "ready");
});

test("completion covers every configured empty slot, including another slot on an occupied date", (t) => {
  const f = fixture(t);
  f.db.sql(`update public.nest_cooking_preferences set meal_slots=array['breakfast','dinner'];
    insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(700)}','${id(10)}','${week}','dinner','Occupied')`);
  const revision = f.baseline(id(700)).expectedRevision;
  const p = f.begin(id(800), input({ expectedWeekRevision: revision })).proposalId;
  f.claim(p);
  const body = content(["breakfast", "dinner"]);
  body.entries = body.entries.filter((e) => e.date !== week || e.slot !== "dinner");
  assert.equal(body.entries.length, 13);
  const ready = f.finish(p, outcome(body)).proposal;
  assert.equal(ready.status, "ready");
  assert.ok(ready.entries.some((e) => e.date === week && e.slot === "breakfast"));
  const other = f.begin(id(801), input({ expectedWeekRevision: revision })).proposalId;
  f.claim(other);
  body.entries.pop();
  assert.equal(f.finish(other, outcome(body)).proposal.failure, "constraints_changed");
});

test("saved proposals require exact complete authorized recipes; familiar-only rejects suggestions", (t) => {
  const f = fixture(t),
    source = savedSource(f);
  const p = f.begin(id(800), input({ familiarOnly: true })).proposalId;
  f.claim(p);
  const body = content();
  body.familiarOnly = true;
  assert.throws(() => f.finish(p, outcome(body)), /Invalid recipe source/);
  body.entries.forEach((e) => {
    e.source = structuredClone(source);
  });
  const tampered = structuredClone(body);
  tampered.entries[0].source.recipe.ingredients[0].name = "Invented";
  assert.throws(() => f.finish(p, outcome(tampered)), /Invalid saved/);
  assert.equal(f.finish(p, outcome(body)).proposal.status, "ready");
  const other = f.begin(id(801)).proposalId;
  f.claim(other);
  const foreign = content();
  foreign.entries[0].source = structuredClone(source);
  foreign.entries[0].source.recipe.definitionId = id(202);
  assert.equal(f.finish(other, outcome(foreign)).proposal.failure, "constraints_changed");
  assert.equal(
    f.db.sql(as(`select private.nest_saved_recipe_payload('${id(20)}','${id(202)}')`)),
    "",
  );
});

test("saved-library changes invalidate completion without retaining stale recipe content", (t) => {
  const f = fixture(t),
    source = savedSource(f),
    p = f.begin(id(800)).proposalId;
  f.claim(p);
  const body = content();
  body.entries[0].source = source;
  f.db.sql(`update public.meal_grocery_templates set quantity='2' where id='${id(300)}'`);
  const result = f.finish(p, outcome(body)).proposal;
  assert.equal(result.failure, "constraints_changed");
  assert.equal(result.entries, null);
});
