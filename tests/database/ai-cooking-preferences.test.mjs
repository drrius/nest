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
  "supabase/migrations/20260920050551_native_cooking_preferences.sql",
  "supabase/migrations/20260920053446_native_ai_cooking_preferences.sql",
])
  db.file(file);
beforeEach(() =>
  db.sql(
    "delete from public.nest_cooking_preferences; delete from public.nest_cooking_preference_receipts",
  ),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const preferences = { cookingNotes: "Quick weekday meals", mealSlots: ["lunch", "dinner"] };
const input = { expectedRevision: "0", preferences };
let sequence = 1000;
function start(actor = id(1)) {
  const conversation = id(sequence++),
    turn = id(sequence++);
  const message = {
    id: turn,
    role: "user",
    parts: [{ type: "text", text: "Save my cooking preferences" }],
  };
  const claim = JSON.parse(
    db.sql(
      as(
        `select public.nest_begin_ai_turn('${id(10)}','${conversation}','${turn}',0,${json(message)})`,
        actor,
      ),
    ),
  );
  return { conversation, turn, claim, actor };
}
const command = (r, value = input, call = "cooking-save") =>
  `select public.nest_execute_ai_command('${id(10)}','${r.conversation}','${r.turn}','${call}','saveCookingPreferences',${json(value)})`;
const execute = (r, value, call) => JSON.parse(db.sql(as(command(r, value, call), r.actor)));
const finish = (r, response = null) =>
  db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${r.conversation}','${r.turn}','interrupted',${response === null ? "null" : json(response)})`,
      r.actor,
    ),
  );
const count = (table) => db.sql(`select count(*) from public.${table}`);

test("cooking journal saves shared preferences with private receipts and conversation isolation", () => {
  const r = start(),
    saved = execute(r);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.actorId, id(1));
  assert.equal(saved.value.householdId, id(10));
  assert.equal(saved.value.revision, "1");
  assert.deepEqual(execute(r), saved);
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  assert.equal(
    db.sql("select cooking_notes from public.nest_cooking_preferences"),
    "Quick weekday meals",
  );
  assert.throws(
    () => execute(r, { ...input, preferences: { ...preferences, cookingNotes: "Partner change" } }),
    /command changed/,
  );
  for (const actor of [id(2), id(3)]) {
    assert.equal(
      db.sql(as("select count(*) from public.nest_cooking_preferences", actor)),
      actor === id(2) ? "1" : "0",
    );
    assert.equal(
      db.sql(as("select count(*) from public.nest_cooking_preference_receipts", actor)),
      "0",
    );
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

test("concurrent duplicate cooking invocations commit exactly one profile revision", async () => {
  const r = start();
  const results = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(command(r)))));
  const values = results.map((result) => JSON.parse(result.stdout));
  for (const value of values) assert.deepEqual(value, values[0]);
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  assert.equal(db.sql("select revision from public.nest_cooking_preferences"), "1");
});

test("two partners editing the same shared revision save one change and journal the conflict", async () => {
  const first = start(),
    second = start(id(2));
  const results = await Promise.all([
    db.concurrent(as(command(first))),
    db.concurrent(
      as(
        command(second, {
          ...input,
          preferences: { ...preferences, cookingNotes: "Partner change" },
        }),
        id(2),
      ),
    ),
  ]);
  const values = results.map((result) => JSON.parse(result.stdout));
  assert.equal(values.filter((value) => value.ok).length, 1);
  assert.deepEqual(
    values.find((value) => !value.ok),
    { ok: false, code: "conflict" },
  );
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  for (const [r, value] of [
    [first, input],
    [second, { ...input, preferences: { ...preferences, cookingNotes: "Partner change" } }],
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
      { cookingNotes: null },
      { cookingNotes: [] },
      { cookingNotes: 1 },
      { cookingNotes: "🥘".repeat(1001) },
      { mealSlots: [] },
      { mealSlots: null },
      { mealSlots: [null] },
      { mealSlots: [1] },
      { mealSlots: [["dinner"]] },
      { mealSlots: ["snack"] },
      { mealSlots: ["dinner", "dinner"] },
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
  assert.equal(count("nest_cooking_preferences"), "0");
  assert.equal(count("nest_cooking_preference_receipts"), "0");
  assert.equal(
    db.sql(
      `select count(*) from public.nest_ai_commands where conversation_id='${r.conversation}'`,
    ),
    "0",
  );
});

test("journal failure rolls back cooking profile and native receipt together", () => {
  const r = start();
  db.sql(
    "create function private.fixture_fail_cooking_journal() returns trigger language plpgsql as $$ begin raise exception 'fixture journal failure'; end $$; create trigger fixture_cooking_journal before insert on public.nest_ai_commands for each row execute function private.fixture_fail_cooking_journal()",
  );
  try {
    assert.throws(() => execute(r), /fixture journal failure/);
  } finally {
    db.sql(
      "drop trigger fixture_cooking_journal on public.nest_ai_commands; drop function private.fixture_fail_cooking_journal()",
    );
  }
  assert.equal(count("nest_cooking_preferences"), "0");
  assert.equal(count("nest_cooking_preference_receipts"), "0");
  assert.equal(execute(r).ok, true);
});

test("recovery replaces forged SDK cooking results with the committed private command fact", () => {
  for (const forge of [false, true]) {
    db.sql(
      "delete from public.nest_cooking_preferences; delete from public.nest_cooking_preference_receipts",
    );
    const r = start(),
      saved = execute(r);
    const response = forge
      ? {
          id: r.claim.assistantId,
          role: "assistant",
          parts: [
            { type: "text", text: "Done" },
            {
              type: "tool-saveCookingPreferences",
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
    const parts = history
      .at(-1)
      .parts.filter((part) => part.type === "tool-saveCookingPreferences");
    assert.equal(parts.length, 1);
    assert.deepEqual(parts[0].input, input);
    assert.deepEqual(parts[0].output, saved);
    assert.equal(parts[0].toolCallId, "cooking-save");
  }
});

test("revoked membership blocks private cooking journal replay and new writes", () => {
  const r = start();
  execute(r);
  db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  try {
    assert.throws(() => execute(r), /Not authorized/);
    assert.throws(() => execute(r, input, "new"), /Not authorized/);
    assert.equal(db.sql(as("select count(*) from public.nest_cooking_preferences")), "0");
    assert.equal(count("nest_cooking_preference_receipts"), "1");
  } finally {
    db.sql(
      `insert into public.household_members(household_id,user_id) values('${id(10)}','${id(1)}')`,
    );
  }
});
