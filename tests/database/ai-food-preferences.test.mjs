import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/ai-command-fixture.sql",
  "supabase/migrations/20260919205503_native_chore_receipts.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
  "supabase/migrations/20260920033321_native_ai_command_journal.sql",
  "supabase/migrations/20260920041525_native_food_preferences.sql",
  "supabase/migrations/20260920044816_native_ai_food_preferences.sql",
])
  db.file(file);
beforeEach(() =>
  db.sql("delete from public.nest_food_profiles; delete from public.nest_food_profile_receipts"),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const preferences = {
  restrictions: ["Peanuts"],
  dislikes: ["Olives"],
  calorieGoal: 2200,
  portions: 1.5,
};
const input = { expectedRevision: "0", preferences };
let sequence = 1000;
function start() {
  const conversation = id(sequence++),
    turn = id(sequence++);
  const message = {
    id: turn,
    role: "user",
    parts: [{ type: "text", text: "Save my food preferences" }],
  };
  const claim = JSON.parse(
    db.sql(
      as(
        `select public.nest_begin_ai_turn('${id(10)}','${conversation}','${turn}',0,${json(message)})`,
      ),
    ),
  );
  return { conversation, turn, claim };
}
const command = (r, value = input, call = "food-save") =>
  `select public.nest_execute_ai_command('${id(10)}','${r.conversation}','${r.turn}','${call}','saveFoodPreferences',${json(value)})`;
const execute = (r, value, call) => JSON.parse(db.sql(as(command(r, value, call))));
const finish = (r, response = null) =>
  db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${r.conversation}','${r.turn}','interrupted',${response === null ? "null" : json(response)})`,
    ),
  );
const count = (table) => db.sql(`select count(*) from public.${table}`);

test("food journal uses owner-private native command, immutable receipt and partner isolation", () => {
  const r = start(),
    saved = execute(r);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.actorId, id(1));
  assert.equal(saved.value.householdId, id(10));
  assert.equal(saved.value.revision, "1");
  assert.deepEqual(execute(r), saved);
  assert.equal(count("nest_food_profile_receipts"), "1");
  assert.equal(db.sql("select calorie_goal from public.nest_food_profiles"), "2200");
  assert.throws(
    () => execute(r, { ...input, preferences: { ...preferences, calorieGoal: null } }),
    /command changed/,
  );
  for (const actor of [id(2), id(3)]) {
    assert.equal(db.sql(as("select count(*) from public.nest_food_profiles", actor)), "0");
    assert.equal(
      db.sql(
        as(
          `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
          actor,
        ),
      ),
      "0",
    );
    assert.throws(() => db.sql(as(command(r), actor)), /Not authorized/);
  }
  finish(r);
  assert.deepEqual(execute(r), saved);
});

test("concurrent duplicate food invocations commit exactly one profile revision", async () => {
  const r = start();
  const results = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(command(r)))));
  const values = results.map((result) => JSON.parse(result.stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(count("nest_food_profile_receipts"), "1");
  assert.equal(db.sql("select revision from public.nest_food_profiles"), "1");
});

test("two conversations editing the same private revision save one change and journal the conflict", async () => {
  const first = start(),
    second = start();
  const results = await Promise.all([
    db.concurrent(as(command(first))),
    db.concurrent(
      as(command(second, { ...input, preferences: { ...preferences, calorieGoal: null } })),
    ),
  ]);
  const values = results.map((result) => JSON.parse(result.stdout));
  assert.equal(values.filter((value) => value.ok).length, 1);
  assert.deepEqual(
    values.find((value) => !value.ok),
    { ok: false, code: "conflict" },
  );
  assert.equal(count("nest_food_profile_receipts"), "1");
  for (const [r, value] of [
    [first, input],
    [second, { ...input, preferences: { ...preferences, calorieGoal: null } }],
  ]) {
    assert.deepEqual(execute(r, value), values[r === first ? 0 : 1]);
    finish(r);
  }
});

test("nested profile commands reject caller identity, retry IDs, coercion, malformed types and bounds", () => {
  const r = start();
  const badPreferences = [
    null,
    [],
    { ...preferences, extra: true },
    ...[
      { restrictions: [null] },
      { restrictions: [4] },
      { dislikes: {} },
      { dislikes: [" "] },
      { dislikes: ["x".repeat(121)] },
      { restrictions: Array(33).fill("x") },
      { calorieGoal: "2200" },
      { calorieGoal: 1.5 },
      { calorieGoal: 20001 },
      { portions: null },
      { portions: "1" },
      { portions: 1.25 },
    ].map((patch) => ({ ...preferences, ...patch })),
  ];
  const invalid = [
    null,
    [],
    { ...input, actorId: id(2) },
    { ...input, operationId: id(100) },
    ...[0, "01", "-1", "9223372036854775808"].map((expectedRevision) => ({
      ...input,
      expectedRevision,
    })),
    ...badPreferences.map((preferences) => ({ ...input, preferences })),
  ];
  for (const value of invalid) assert.throws(() => execute(r, value), /Invalid|too long/);
  assert.equal(count("nest_food_profiles"), "0");
  assert.equal(count("nest_food_profile_receipts"), "0");
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "0",
  );
});

test("journal failure rolls back food profile and native receipt together", () => {
  const r = start();
  db.sql(
    "create function private.fixture_fail_food_journal() returns trigger language plpgsql as $$ begin raise exception 'fixture journal failure'; end $$; create trigger fixture_food_journal before insert on public.nest_ai_commands for each row execute function private.fixture_fail_food_journal()",
  );
  try {
    assert.throws(() => execute(r), /fixture journal failure/);
  } finally {
    db.sql(
      "drop trigger fixture_food_journal on public.nest_ai_commands; drop function private.fixture_fail_food_journal()",
    );
  }
  assert.equal(count("nest_food_profiles"), "0");
  assert.equal(count("nest_food_profile_receipts"), "0");
  assert.equal(execute(r).ok, true);
});

test("recovery replaces forged SDK food results with the committed private command fact", () => {
  for (const forge of [false, true]) {
    db.sql("delete from public.nest_food_profiles; delete from public.nest_food_profile_receipts");
    const r = start(),
      saved = execute(r);
    const response = forge
      ? {
          id: r.claim.assistantId,
          role: "assistant",
          parts: [
            { type: "text", text: "Done" },
            {
              type: "tool-saveFoodPreferences",
              toolCallId: "invented",
              state: "output-available",
              input: { expectedRevision: "99" },
              output: { ok: true, value: { revision: "100" } },
            },
          ],
        }
      : null;
    finish(r, response);
    const history = JSON.parse(
      db.sql(`select transcript from public.nest_ai_conversations where id='${r.conversation}'`),
    );
    const parts = history.at(-1).parts.filter((part) => part.type === "tool-saveFoodPreferences");
    assert.equal(parts.length, 1);
    assert.deepEqual(parts[0].input, input);
    assert.deepEqual(parts[0].output, saved);
    assert.equal(parts[0].toolCallId, "food-save");
  }
});

test("revoked membership blocks private food journal replay and new writes", () => {
  const r = start();
  execute(r);
  db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  try {
    assert.throws(() => execute(r), /Not authorized/);
    assert.throws(() => execute(r, input, "new"), /Not authorized/);
    assert.equal(db.sql(as("select count(*) from public.nest_food_profiles")), "0");
    assert.equal(count("nest_food_profile_receipts"), "1");
  } finally {
    db.sql(
      `insert into public.household_members(household_id,user_id) values('${id(10)}','${id(1)}')`,
    );
  }
});
