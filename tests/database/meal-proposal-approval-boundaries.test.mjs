import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, target, id, week, content } from "./meal-proposal-approval-fixture.mjs";

test("approval preserves occupied slots and posts every remaining reviewed slot for each configured slot set", (t) => {
  for (let mask = 1; mask < 8; mask++) {
    const f = fixture(t),
      slots = ["breakfast", "lunch", "dinner"].filter((_, i) => mask & (1 << i));
    f.db
      .sql(`update public.nest_cooking_preferences set meal_slots=array[${slots.map((s) => `'${s}'`).join(",")}];
      insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(700)}','${id(10)}','${week}','${slots[0]}','Keep existing')`);
    const body = content(slots);
    body.entries = body.entries.filter((e) => e.date !== week || e.slot !== slots[0]);
    const p = f.ready(id(800), body),
      receipt = f.approve(id(801), target(p));
    assert.equal(receipt.entries.length, slots.length * 7 - 1);
    assert.equal(receipt.previousWeekRevision, "1");
    assert.equal(receipt.weekRevision, String(slots.length * 7));
    assert.equal(
      f.db.sql(`select title_snapshot from public.meal_plan_entries where id='${id(700)}'`),
      "Keep existing",
    );
    assert.deepEqual(
      receipt.entries.map((e) => [e.proposalEntryId, e.date, e.slot]),
      body.entries.map((e) => [e.entryId, e.date, e.slot]),
    );
  }
});

test("approval rechecks expiry after a blocking week lock and rolls back every posted entry", async (t) => {
  const f = fixture(t),
    p = f.ready();
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()+interval '500 milliseconds' where proposal_id='${p}'`,
  );
  const held = f.db.concurrent(`set application_name='approval-expiry-lock'; begin;
    select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${week}' for update;
    select pg_sleep(0.8); commit`);
  for (let attempt = 0; ; attempt++) {
    if (
      f.db.sql(
        "select count(*) from pg_stat_activity where application_name='approval-expiry-lock' and wait_event='PgSleep'",
      ) === "1"
    )
      break;
    assert.ok(attempt < 150);
    await setTimeout(5);
  }
  await assert.rejects(f.db.concurrent(f.approveCommand(id(801), target(p))), /expired/);
  await held;
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
  assert.equal(f.baseline(id(700)).expectedRevision, "0");
  assert.equal(f.read(p).proposal.status, "ready");
});

test("food mutations holding a row lock prevent approval rather than posting against stale constraints", async (t) => {
  const f = fixture(t),
    p = f.ready();
  const held = f.db.concurrent(`set application_name='approval-food-lock'; begin;
    update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}';
    select pg_sleep(0.7); commit`);
  for (let attempt = 0; ; attempt++) {
    if (
      f.db.sql(
        "select count(*) from pg_stat_activity where application_name='approval-food-lock' and wait_event='PgSleep'",
      ) === "1"
    )
      break;
    assert.ok(attempt < 150);
    await setTimeout(5);
  }
  assert.throws(() => f.approve(id(801), target(p)), /changed/);
  await held;
  assert.throws(() => f.approve(id(801), target(p)), /changed/);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
});
