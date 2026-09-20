import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, input, command, decode } from "./meal-placement-fixture.mjs";
const { db, place, read } = fixture();
after(() => db.stop());
const weekInput = (week, overrides = {}) => input(week, { weekStart: week, ...overrides });
async function waitFor(application, event) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and wait_event='${event}'`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing barrier ${application}/${event}`);
}
const legacy = (
  date,
) => `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot)
  values('${id(10)}','${date}','lunch','Legacy write')`;

test("concurrent identical operation returns one receipt and creates one meal", async () => {
  const payload = weekInput("2026-10-05");
  const results = await Promise.all(
    Array.from({ length: 6 }, () => db.concurrent(command(id(301), payload))),
  );
  const receipts = results.map((result) => decode(JSON.parse(result.stdout.trim())));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  assert.equal(read("2026-10-05").revision, "1");
  assert.equal(read("2026-10-05").entries.length, 1);
});

test("competing operations serialize empty slots and the whole expected week", async () => {
  for (let i = 0; i < 12; i++) {
    const week = new Date(Date.UTC(2027, 0, 4 + 7 * i)).toISOString().slice(0, 10);
    const date = new Date(Date.UTC(2027, 0, 5 + 7 * i)).toISOString().slice(0, 10);
    const first = weekInput(week);
    const second = i % 2 === 0 ? first : { ...first, date };
    const results = await Promise.allSettled([
      db.concurrent(command(id(310 + i * 2), first)),
      db.concurrent(command(id(311 + i * 2), second, { actor: id(2) })),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const failure = results.find((result) => result.status === "rejected");
    assert.match(failure.reason.message, /Meal week changed/);
    assert.equal(read(week).revision, "1");
    assert.equal(read(week).entries.length, 1);
  }
});

test("a legacy writer committed while native waits invalidates its empty-week baseline", async () => {
  const held = db.concurrent(
    `set application_name='meal-legacy-before'; begin; ${legacy("2026-10-12")}; select pg_sleep(0.8); commit`,
  );
  await waitFor("meal-legacy-before", "PgSleep");
  const placement = db.concurrent(
    `set application_name='meal-native-wait'; ${command(id(350), weekInput("2026-10-12", { date: "2026-10-13" }))}`,
  );
  const rejected = assert.rejects(placement, /Meal week changed/);
  await waitFor("meal-native-wait", "transactionid");
  await held;
  await rejected;
  assert.equal(read("2026-10-12").revision, "1");
  assert.equal(read("2026-10-12").entries[0].title, "Legacy write");
});

test("legacy writes after native commit advance the same generation without losing either meal", async () => {
  const held = db.concurrent(
    `set application_name='meal-native-first'; begin; ${command(id(351), weekInput("2026-10-19"))}; select pg_sleep(0.8); commit`,
  );
  await waitFor("meal-native-first", "PgSleep");
  const writing = db.concurrent(
    `set application_name='meal-legacy-after'; ${legacy("2026-10-20")}`,
  );
  await waitFor("meal-legacy-after", "transactionid");
  await held;
  await writing;
  const week = read("2026-10-19");
  assert.equal(week.revision, "2");
  assert.equal(week.entries.length, 2);
  assert.equal(place(id(351), weekInput("2026-10-19")).revision, "1");
});

test("lock timeout is a stable conflict and leaves no entry or zero counter behind", async () => {
  db.sql(`insert into public.nest_meal_week_revisions values('${id(10)}','2026-10-26',0)`);
  const held = db.concurrent(`set application_name='meal-week-held'; begin;
    select revision from public.nest_meal_week_revisions where week_start='2026-10-26' for update;
    select pg_sleep(0.5); commit`);
  await waitFor("meal-week-held", "PgSleep");
  await assert.rejects(
    db.concurrent(`set lock_timeout='30ms'; ${command(id(352), weekInput("2026-10-26"))}`),
    /Meal week changed/,
  );
  await held;
  assert.deepEqual(read("2026-10-26").entries, []);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_meal_placement_receipts where operation_id='${id(352)}'`,
    ),
    "0",
  );
  assert.equal(place(id(352), weekInput("2026-10-26")).revision, "1");
});

test("membership revocation that wins the lock prevents receipt replay", async () => {
  const held = db.concurrent(`set application_name='meal-revoke'; begin;
    delete from public.household_members where user_id='${id(1)}'; select pg_sleep(0.6); commit`);
  await waitFor("meal-revoke", "PgSleep");
  const replay = db.concurrent(
    `set application_name='meal-replay'; ${command(id(301), weekInput("2026-10-05"))}`,
  );
  const rejected = assert.rejects(replay, /Not authorized/);
  await waitFor("meal-replay", "transactionid");
  await held;
  await rejected;
});
