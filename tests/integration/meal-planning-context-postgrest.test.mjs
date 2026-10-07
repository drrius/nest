import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id, seed } from "../database/meal-planning-context-fixture.mjs";
import { mealPlanningContextReader } from "../../apps/api/src/meal-planning/read-context.ts";
import { prepareGeneration } from "../../apps/api/src/meal-planning/generation-input.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Redacted = require("effect/Redacted");
const request = (bearer, household = id(10)) =>
  new Request("http://nest.local/", {
    headers: { authorization: `Bearer ${bearer}`, "x-nest-household": household },
  });

const generation = (context) =>
  prepareGeneration(
    {
      context,
      week: {
        version: 1,
        householdId: id(10),
        weekStart: "2030-01-07",
        revision: "1",
        entries: [],
      },
      library: { householdId: id(10), revision: "1", recipes: [] },
      busy: { version: 1, householdId: id(10), snapshots: [] },
      familiarOnly: false,
    },
    Date.UTC(2030, 0, 7),
  );

test("saved half-portions reach generation inputs without sharing either member's private goal", async (t) => {
  const remote = await postgrestFixture(t, files);
  seed(remote.db);
  remote.db.file("tests/integration/food-postgrest.sql");
  const read = mealPlanningContextReader(
    { url: remote.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(remote.serverKey),
  );
  const before = await Effect.runPromise(read(request(remote.bearer)));
  for (const [bearer, goal, restriction, portions] of [
    [remote.bearer, 1800, "No peanuts", 0.5],
    [remote.partnerBearer, 2400, "Vegetarian", 2.5],
  ]) {
    const saved = await fetch(`${remote.url}/rest/v1/rpc/nest_save_food_profile`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_household: id(10),
        p_operation: id(102),
        p_expected: 1,
        p_restrictions: [restriction],
        p_dislikes: ["Celery"],
        p_calorie_goal: goal,
        p_portions: portions,
      }),
    });
    assert.equal(saved.status, 200);
  }
  const owner = await Effect.runPromise(read(request(remote.bearer)));
  const partner = await Effect.runPromise(read(request(remote.partnerBearer)));
  assert.notEqual(owner.stateHash, before.stateHash);
  assert.equal(owner.stateHash, partner.stateHash);
  for (const [context, goal] of [
    [owner, 1800],
    [partner, 2400],
  ]) {
    const prepared = generation(context);
    assert.deepEqual(
      prepared.members.map((member) => member.portions),
      [0.5, 2.5],
    );
    assert.deepEqual(
      prepared.members.map((member) => member.restrictions),
      [["No peanuts"], ["Vegetarian"]],
    );
    assert.equal(prepared.requesterCalorieGoal, goal);
    for (const member of prepared.members) {
      assert.deepEqual(Object.keys(member).sort(), ["dislikes", "portions", "restrictions"]);
    }
    assert.equal(prepared.slots.length, 7);
    assert.ok(
      prepared.availability.every((day) =>
        day.members.every((member) => member.status === "unknown"),
      ),
    );
  }
});

test("internal planning reader authenticates first and alone reaches the privileged projection", async (t) => {
  const remote = await postgrestFixture(t, files);
  seed(remote.db);
  remote.db.file("tests/integration/food-postgrest.sql");
  const config = { url: remote.url, publishableKey: "sb_publishable_fixture" };
  const read = mealPlanningContextReader(config, Redacted.make(remote.serverKey));
  const owner = await Effect.runPromise(read(request(remote.bearer)));
  assert.equal(owner.actorId, id(1));
  assert.equal(owner.requesterCalorieGoal, 1800);
  assert.deepEqual(owner.members[1].profile.restrictions, ["Vegetarian"]);
  const partner = await Effect.runPromise(read(request(remote.partnerBearer)));
  assert.equal(partner.requesterCalorieGoal, 2400);
  for (const bearer of [remote.bearer, remote.partnerBearer, remote.otherBearer]) {
    const denied = await fetch(`${remote.url}/rest/v1/rpc/nest_meal_planning_context`, {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify({ p_actor: id(1), p_household: id(10) }),
    });
    assert.equal(denied.status, 403);
  }
  const outcome = (req) => Effect.runPromise(read(req).pipe(Effect.flip));
  assert.equal((await outcome(request(remote.otherBearer))).code, "forbidden");
  assert.equal((await outcome(request("invalid"))).code, "unauthenticated");
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await outcome(request(remote.bearer))).code, "not_a_member");
  assert.throws(
    () => mealPlanningContextReader(config, Redacted.make("sb_publishable_wrong")),
    /server-only/,
  );
});
