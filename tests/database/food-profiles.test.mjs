import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20260920041525_native_food_preferences.sql");
beforeEach(() =>
  db.sql("delete from public.nest_food_profile_receipts; delete from public.nest_food_profiles"),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
const sql = (change = {}) => {
  const input = {
    home: 10,
    operation: 100,
    expected: 0,
    restrictions: "array['Peanuts']",
    dislikes: "array['Olives']",
    calories: "2200",
    portions: "1.5",
    ...change,
  };
  return `select public.nest_save_food_profile('${id(input.home)}','${id(input.operation)}',${input.expected},${input.restrictions},${input.dislikes},${input.calories},${input.portions})`;
};
const save = (actor = 1, change) => JSON.parse(db.sql(as(actor, sql(change))));
const read = (actor) => db.sql(as(actor, "select row_to_json(p) from public.nest_food_profiles p"));

test("missing food setup stays absent; owner save and exact retry retain private preferences once", () => {
  assert.equal(read(1), "");
  const receipt = save();
  assert.deepEqual(receipt, {
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    revision: "1",
  });
  assert.deepEqual(save(), receipt);
  const profile = JSON.parse(read(1));
  assert.deepEqual(profile.restrictions, ["Peanuts"]);
  assert.equal(profile.calorie_goal, 2200);
  assert.equal(profile.portions, 1.5);
  assert.equal(db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  assert.ok(!JSON.stringify(receipt).includes("Peanuts"));
});

test("partner, other household and anonymous cannot read a private profile or its receipts", () => {
  save();
  for (const actor of [2, 3]) {
    assert.equal(read(actor), "");
    assert.equal(db.sql(as(actor, "select count(*) from public.nest_food_profile_receipts")), "0");
  }
  assert.throws(
    () => db.sql("set role anon; select * from public.nest_food_profiles"),
    /permission denied/,
  );
  assert.throws(() => db.sql(`set role anon; ${sql()}`), /permission denied/);
  assert.throws(() => save(3), /Not authorized/);
  assert.throws(() => save(1, { home: 20 }), /Not authorized/);
});

test("the same operation UUID is isolated between partners and cannot overwrite another profile", () => {
  save();
  save(2, { calories: "1800", restrictions: "array['Dairy']" });
  assert.equal(JSON.parse(read(1)).calorie_goal, 2200);
  assert.equal(JSON.parse(read(2)).calorie_goal, 1800);
  assert.equal(db.sql("select count(*) from public.nest_food_profiles"), "2");
});

test("changed invocation and stale revisions fail while old receipt replay remains immutable", () => {
  const first = save();
  assert.throws(() => save(1, { calories: "1800" }), /operation changed/);
  assert.throws(() => save(1, { operation: 101 }), /preferences changed/);
  assert.equal(
    save(1, {
      operation: 101,
      expected: 1,
      calories: "null",
      restrictions: "array[]::text[]",
      portions: "1",
    }).revision,
    "2",
  );
  assert.deepEqual(save(), first);
  const profile = JSON.parse(read(1));
  assert.equal(profile.calorie_goal, null);
  assert.deepEqual(profile.restrictions, []);
  assert.equal(profile.revision, 2);
});

test("concurrent exact saves commit once and competing first saves conflict", async () => {
  const same = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(1, sql()))));
  for (const result of same)
    assert.deepEqual(JSON.parse(result.stdout), JSON.parse(same[0].stdout));
  const competing = await Promise.allSettled(
    [101, 102].map((operation) => db.concurrent(as(2, sql({ operation })))),
  );
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.sql("select count(*) from public.nest_food_profile_receipts"), "2");
});

test("invalid or unbounded preferences fail without creating a confirmed setup row", () => {
  for (const change of [
    { restrictions: "null" },
    { restrictions: "array[null]::text[]" },
    { restrictions: "array['   ']" },
    { restrictions: "array[E'\\t']" },
    { restrictions: "array[repeat('x',121)]" },
    { restrictions: "array_fill('x'::text,array[33])" },
    { restrictions: "array[['a'],['b']]" },
    { dislikes: "null" },
    { calories: "0" },
    { calories: "20001" },
    { portions: "0" },
    { portions: "1.25" },
    { portions: "4.5" },
    { portions: "null" },
    { portions: "'NaN'::numeric" },
  ])
    assert.throws(() => save(1, change), /Invalid food preferences/);
  assert.equal(read(1), "");
});

test("direct writes, actor reassignment and receipt deletion are denied", () => {
  save();
  for (const statement of [
    `update public.nest_food_profiles set actor_id='${id(2)}'`,
    "update public.nest_food_profiles set calorie_goal=1000",
    "delete from public.nest_food_profiles",
    "delete from public.nest_food_profile_receipts",
    "select private.nest_valid_food_texts(array['a'])",
  ])
    assert.throws(() => db.sql(as(1, statement)), /permission denied/);
});

test("revocation hides retained preferences and prevents old receipt replay", (t) => {
  save();
  db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  t.after(() =>
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First')`,
    ),
  );
  assert.equal(read(1), "");
  assert.throws(() => save(), /Not authorized/);
  assert.equal(db.sql("select count(*) from public.nest_food_profiles"), "1");
});

test("receipt insertion failure rolls back profile creation and supports a clean retry", () => {
  db.sql(`create function private.reject_food_receipt() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Fixture receipt failure'; end; $$;
    create trigger reject_food_receipt before insert on public.nest_food_profile_receipts for each row execute function private.reject_food_receipt();`);
  try {
    assert.throws(() => save(), /Fixture receipt failure/);
    assert.equal(read(1), "");
  } finally {
    db.sql(
      "drop trigger reject_food_receipt on public.nest_food_profile_receipts; drop function private.reject_food_receipt()",
    );
  }
  assert.equal(save().revision, "1");
});

test("membership revocation serializes after an in-flight authorized save", async (t) => {
  const saving = db.concurrent(
    as(1, `set application_name='nest-food-save'; begin; ${sql()}; select pg_sleep(0.3); commit;`),
  );
  let waiting = false;
  for (let n = 0; n < 30; n++) {
    waiting =
      db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-food-save' and wait_event='PgSleep'",
      ) === "1";
    if (waiting) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(waiting, true, "save holds the membership lock before revocation");
  t.after(() =>
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First') on conflict do nothing`,
    ),
  );
  const revoke = db.concurrent(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await Promise.all([saving, revoke]);
  assert.equal(db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  assert.equal(read(1), "");
  assert.throws(() => save(), /Not authorized/);
});
