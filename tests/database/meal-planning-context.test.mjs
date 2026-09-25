import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { MealPlanningContext } from "../../apps/api/src/meal-planning/context-schema.ts";
import { fixture, seed, query, as, id } from "./meal-planning-context-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (value) =>
  Schema.decodeUnknownSync(MealPlanningContext)(value, { onExcessProperty: "error" });

test("planning projection uses both private constraints but only the requester's calorie goal", (t) => {
  const f = fixture(t);
  seed(f.db);
  const owner = decode(f.read()),
    partner = decode(f.read(id(2)));
  assert.deepEqual(
    owner.members.map((m) => m.profile.restrictions),
    [["No peanuts"], ["Vegetarian"]],
  );
  assert.equal(owner.requesterCalorieGoal, 1800);
  assert.equal(partner.requesterCalorieGoal, 2400);
  assert.equal(owner.stateHash, partner.stateHash);
  assert.equal(owner.stateHash, f.read().stateHash);
  for (const timezone of ["UTC", "Europe/Zurich", "Pacific/Kiritimati", "America/New_York"])
    assert.equal(
      JSON.parse(f.db.sql(`set timezone='${timezone}'; set role service_role; ${query()}`))
        .stateHash,
      owner.stateHash,
    );
  for (const member of owner.members)
    assert.deepEqual(Object.keys(member.profile).sort(), [
      "dislikes",
      "portions",
      "restrictions",
      "revision",
    ]);
  assert.equal(owner.cooking.preferences.cookingNotes, "Quick meals");
  f.db.sql(`begin read only; set local role service_role; ${query()}; commit`);
  assert.equal(f.db.sql(as("select count(*) from public.nest_food_profiles")), "1");
});

test("client roles cannot call either projection function or impersonate a trusted planning server", (t) => {
  const f = fixture(t);
  seed(f.db);
  for (const role of ["anon", "authenticated"]) {
    for (const schema of ["public", "private"]) {
      const call = query().replace("public.", `${schema}.`);
      assert.throws(
        () => f.db.sql(`set role ${role}; set request.jwt.claim.sub='${id(1)}'; ${call}`),
        /permission denied/,
      );
    }
  }
  assert.throws(() => f.read(id(3)), /Not authorized/);
  assert.throws(() => f.read(id(1), id(20)), /Not authorized/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.read(), /Not authorized/);
  assert.throws(() => f.read(id(2)), /setup incomplete/);
});

test("missing setup remains unknown and stale profile, cooking or membership context changes its fingerprint", (t) => {
  const f = fixture(t);
  const missing = decode(f.read());
  assert.deepEqual(
    missing.members.map((m) => m.profile),
    [null, null],
  );
  assert.equal(missing.cooking, null);
  assert.equal(missing.requesterCalorieGoal, null);
  seed(f.db);
  const configured = f.read();
  assert.notEqual(configured.stateHash, missing.stateHash);
  f.db.sql(
    as(
      `select public.nest_save_food_profile('${id(10)}','${id(102)}',1,array['Vegan'],array[]::text[],2500,2)`,
      id(2),
    ),
  );
  const changed = decode(f.read());
  assert.notEqual(changed.stateHash, configured.stateHash);
  assert.deepEqual(changed.members[1].profile.restrictions, ["Vegan"]);
  assert.equal(changed.requesterCalorieGoal, 1800);
  for (const member of changed.members)
    assert.deepEqual(Object.keys(member.profile).sort(), [
      "dislikes",
      "portions",
      "restrictions",
      "revision",
    ]);
  f.db.sql(
    as(
      `select public.nest_save_cooking_preferences('${id(10)}','${id(103)}',1,'Batch cooking',array['lunch','dinner'])`,
    ),
  );
  const cooking = f.read();
  assert.notEqual(cooking.stateHash, changed.stateHash);
  f.db.sql(
    `update public.household_members set joined_at=joined_at+interval '1 second' where user_id='${id(2)}'`,
  );
  assert.notEqual(f.read().stateHash, cooking.stateHash);
  f.db.sql(
    `insert into public.nest_food_profiles values ('${id(3)}','${id(20)}',1,array['Foreign secret'],array[]::text[],9999,1,now())`,
  );
  assert.equal(JSON.stringify(f.read()).includes("Foreign secret"), false);
});

test("server context decoder rejects malformed scope, member lists and private goal contamination", (t) => {
  const f = fixture(t);
  seed(f.db);
  const value = f.read();
  for (const patch of [
    { members: [] },
    { members: [value.members[0], value.members[0]] },
    { actorId: id(3) },
    { stateHash: "bad" },
    { partnerCalorieGoal: 2400 },
    { cooking: { ...value.cooking, revision: "0" } },
  ])
    assert.throws(() => decode({ ...value, ...patch }));
  const contaminated = structuredClone(value);
  contaminated.members[1].profile.calorieGoal = 2400;
  assert.throws(() => decode(contaminated));
  const missing = structuredClone(value);
  missing.members[0].profile = null;
  assert.throws(() => decode(missing));
});
