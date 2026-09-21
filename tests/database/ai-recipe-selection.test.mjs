import { recipeSelectionFiles } from "./recipe-selection-fixture.mjs";
import { aiRecipeCreationFiles } from "./ai-recipe-creation-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeJournalFixture, id, as, json } from "./ai-recipe-creation-fixture.mjs";
const week = "2030-01-07";
const input = (patch = {}) => ({
  weekStart: week,
  date: week,
  slot: "dinner",
  expectedRevision: "0",
  definitionId: id(200),
  expectedLibraryRevision: "0",
  ...patch,
});
function fixture(t) {
  const journal = aiRecipeCreationFiles.slice(
    aiRecipeCreationFiles.indexOf(
      "supabase/migrations/20260919220034_native_private_conversations.sql",
    ),
  );
  const f = recipeJournalFixture(t, [...new Set([...recipeSelectionFiles, ...journal])]);
  const command = (turn, value, tool = "placeRecipe") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','selection','${tool}',${json(value)})`;
  const execute = (turn, value, tool) =>
    JSON.parse(f.db.sql(as(command(turn, value, tool), turn.actor)));
  return { ...f, command, execute };
}
test("journaled selection applies once across concurrent calls and replays after library changes", async (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, value)))),
  );
  const saved = JSON.parse(results[0].stdout);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.definitionId, id(200));
  assert.equal(saved.value.libraryRevision, "0");
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  f.db.sql(
    `update public.meal_definitions set archived_at=now(),name='Later edit' where id='${id(200)}'`,
  );
  assert.deepEqual(f.execute(turn, value), saved);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.throws(() => f.execute(turn, input({ date: "2030-01-08" })), /command changed/);
});
test("failed selection journal rolls back entry, snapshot, receipt and week revision", (t) => {
  const f = fixture(t),
    turn = f.start();
  const before = f.db.sql("select count(*) from public.meal_plan_entries");
  f.db.sql(
    `create function private.reject_selection_journal() returns trigger language plpgsql as $$ begin raise exception 'Injected journal failure'; end $$; create trigger reject_selection_journal before insert on public.nest_ai_commands for each row execute function private.reject_selection_journal()`,
  );
  assert.throws(() => f.execute(turn, input()), /Injected journal failure/);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), before);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recipe_selection_receipts"), "0");
  f.db.sql("drop trigger reject_selection_journal on public.nest_ai_commands");
  assert.equal(f.execute(turn, input()).value.revision, "1");
});
test("journaled recipe replacement binds original entry and rejects partner or revoked recovery", (t) => {
  const f = fixture(t),
    first = f.execute(f.start(), input()).value,
    turn = f.start();
  const value = input({ expectedRevision: "1", entryId: first.entryId });
  const saved = f.execute(turn, value, "replaceWithRecipe");
  assert.equal(saved.ok, true);
  assert.equal(saved.value.previousEntryId, first.entryId);
  assert.equal(saved.value.revision, "3");
  assert.notEqual(saved.value.entryId, first.entryId);
  assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "2");
  assert.throws(
    () => f.db.sql(as(f.command(turn, value, "replaceWithRecipe"), id(2))),
    /authorized|another/i,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.execute(turn, value, "replaceWithRecipe"), /authorized/i);
});
