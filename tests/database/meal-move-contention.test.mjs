import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, week, command } from "./meal-move-fixture.mjs";
const { db, add, input, move, revision } = fixture();
after(() => db.stop());
async function waitFor(name, event = "PgSleep") {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='${event}'`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing lock barrier ${name}/${event}`);
}
test("legacy row-first editor cannot leave a partial move during lock inversion", async () => {
  const entry = add(800).entryId,
    value = input(entry);
  const held = db.concurrent(
    `set application_name='legacy-move-editor'; begin; select id from public.meal_plan_entries where id='${entry}' for update; select pg_sleep(0.6); update public.meal_plan_entries set title_snapshot='Legacy edited' where id='${entry}'; commit`,
  );
  await waitFor("legacy-move-editor");
  await assert.rejects(
    db.concurrent(`set lock_timeout='30ms'; ${command(id(801), value)}`),
    /Meal week changed/,
  );
  assert.equal(revision(value.targetWeekStart), "0");
  await held;
  assert.equal(
    db.sql(
      `select date::text||':'||title_snapshot from public.meal_plan_entries where id='${entry}'`,
    ),
    `${week}:Legacy edited`,
  );
  assert.throws(() => move(id(801), value), /Meal week changed/);
  assert.equal(move(id(801), input(entry)).entryId, entry);
});
test("committed leftover insertion blocks a waiting source move even across unrelated weeks", async () => {
  const entry = add(810).entryId,
    value = input(entry, "2030-02-04");
  const child = db.concurrent(`set application_name='leftover-before-move'; begin;
    insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(811)}','${id(10)}','2030-01-28','dinner','Leftovers','${entry}'); select pg_sleep(0.6); commit`);
  await waitFor("leftover-before-move");
  const moving = db.concurrent(
    `set application_name='move-after-leftover'; ${command(id(812), value)}`,
  );
  const rejected = assert.rejects(moving, /Meal week changed/);
  await waitFor("move-after-leftover", "transactionid");
  await child;
  await rejected;
  assert.equal(db.sql(`select date::text from public.meal_plan_entries where id='${entry}'`), week);
  assert.equal(revision(value.targetWeekStart), "0");
});
test("a child waiting behind a moved source cannot commit an earlier leftover", async () => {
  const entry = add(820).entryId,
    value = input(entry, "2030-02-11");
  const moving = db.concurrent(
    `set application_name='move-before-leftover'; begin; ${command(id(821), value)}; select pg_sleep(0.6); commit`,
  );
  await waitFor("move-before-leftover");
  const child = db.concurrent(
    `set application_name='leftover-after-move'; insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(822)}','${id(10)}','2030-02-04','dinner','Invalid leftovers','${entry}')`,
  );
  const rejected = assert.rejects(child, /source must be earlier/);
  await waitFor("leftover-after-move", "transactionid");
  await moving;
  await rejected;
  assert.equal(
    db.sql(`select date::text from public.meal_plan_entries where id='${entry}'`),
    value.date,
  );
  assert.equal(db.sql(`select count(*) from public.meal_plan_entries where id='${id(822)}'`), "0");
});
