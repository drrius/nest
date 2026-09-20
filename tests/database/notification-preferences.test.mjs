import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20260920072531_native_notification_preferences.sql");
beforeEach(() =>
  db.sql(
    "delete from public.nest_notification_preference_receipts; delete from public.nest_notification_preferences",
  ),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
const sql = (change = {}) => {
  const input = {
    home: 10,
    operation: 100,
    expected: 0,
    enabled: "true",
    time: "'08:00'",
    items: "false",
    ...change,
  };
  return `select public.nest_save_notification_preferences('${id(input.home)}','${id(input.operation)}',${input.expected},${input.enabled},${input.time},${input.items})`;
};
const save = (actor = 1, change) => JSON.parse(db.sql(as(actor, sql(change))));
const read = (actor) =>
  db.sql(as(actor, "select row_to_json(p) from public.nest_notification_preferences p"));

test("missing notification setup stays absent; owner save and exact retry retain private preferences once", () => {
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
  assert.equal(profile.daily_summary_enabled, true);
  assert.equal(profile.daily_summary_time, "08:00");
  assert.equal(profile.item_reminders_enabled, false);
  assert.equal(db.sql("select count(*) from public.nest_notification_preference_receipts"), "1");
  assert.ok(!JSON.stringify(receipt).includes("08:00"));
});

test("partner, other household and anonymous cannot read a private profile or its receipts", () => {
  save();
  for (const actor of [2, 3]) {
    assert.equal(read(actor), "");
    assert.equal(
      db.sql(as(actor, "select count(*) from public.nest_notification_preference_receipts")),
      "0",
    );
  }
  assert.throws(
    () => db.sql("set role anon; select * from public.nest_notification_preferences"),
    /permission denied/,
  );
  assert.throws(() => db.sql(`set role anon; ${sql()}`), /permission denied/);
  assert.throws(() => save(3), /Not authorized/);
  assert.throws(() => save(1, { home: 20 }), /Not authorized/);
});

test("the same operation UUID is isolated between partners and cannot overwrite another profile", () => {
  save();
  save(2, { time: "'19:30'", enabled: "false" });
  assert.equal(JSON.parse(read(1)).daily_summary_time, "08:00");
  assert.equal(JSON.parse(read(2)).daily_summary_time, "19:30");
  assert.equal(db.sql("select count(*) from public.nest_notification_preferences"), "2");
});

test("changed invocation and stale revisions fail while old receipt replay remains immutable", () => {
  const first = save();
  assert.throws(() => save(1, { enabled: "false" }), /operation changed/);
  assert.throws(() => save(1, { operation: 101 }), /preferences changed/);
  assert.equal(
    save(1, {
      operation: 101,
      expected: 1,
      enabled: "false",
      items: "true",
      time: "'23:59'",
    }).revision,
    "2",
  );
  assert.deepEqual(save(), first);
  const profile = JSON.parse(read(1));
  assert.equal(profile.daily_summary_enabled, false);
  assert.equal(profile.item_reminders_enabled, true);
  assert.equal(profile.daily_summary_time, "23:59");
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
  assert.equal(db.sql("select count(*) from public.nest_notification_preference_receipts"), "2");
});

test("invalid or unbounded preferences fail without creating a confirmed setup row", () => {
  for (const change of [
    { enabled: "null" },
    { items: "null" },
    { time: "null" },
    { time: "'24:00'" },
    { time: "'8:00'" },
    { time: "'08:60'" },
    { time: "E'08:00\\n'" },
    { time: "' 08:00'" },
    { expected: -1 },
  ])
    assert.throws(() => save(1, change), /Invalid notification preferences/);
  assert.equal(read(1), "");
});

test("direct writes, actor reassignment and receipt deletion are denied", () => {
  save();
  for (const statement of [
    `update public.nest_notification_preferences set actor_id='${id(2)}'`,
    "update public.nest_notification_preferences set daily_summary_enabled=false",
    "delete from public.nest_notification_preferences",
    "delete from public.nest_notification_preference_receipts",
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
  assert.equal(db.sql("select count(*) from public.nest_notification_preferences"), "1");
});

test("receipt insertion failure rolls back profile creation and supports a clean retry", () => {
  db.sql(`create function private.reject_notification_receipt() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Fixture receipt failure'; end; $$;
    create trigger reject_notification_receipt before insert on public.nest_notification_preference_receipts for each row execute function private.reject_notification_receipt();`);
  try {
    assert.throws(() => save(), /Fixture receipt failure/);
    assert.equal(read(1), "");
  } finally {
    db.sql(
      "drop trigger reject_notification_receipt on public.nest_notification_preference_receipts; drop function private.reject_notification_receipt()",
    );
  }
  assert.equal(save().revision, "1");
});

test("membership revocation serializes after an in-flight authorized save", async (t) => {
  const saving = db.concurrent(
    as(
      1,
      `set application_name='nest-notification-save'; begin; ${sql()}; select pg_sleep(0.3); commit;`,
    ),
  );
  let waiting = false;
  for (let n = 0; n < 30; n++) {
    waiting =
      db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-notification-save' and wait_event='PgSleep'",
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
  assert.equal(db.sql("select count(*) from public.nest_notification_preference_receipts"), "1");
  assert.equal(read(1), "");
  assert.throws(() => save(), /Not authorized/);
});

test("exhaustive wall-clock times match the shared schema and SQL; overflow cannot mutate", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
  const Schema = await import(require.resolve("effect/Schema"));
  const { NotificationPreferences } = await import("../../packages/contracts/src/notifications.ts");
  const valid = Schema.is(NotificationPreferences);
  const times = Array.from(
    { length: 1440 },
    (_, n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
  );
  for (const time of times)
    assert.equal(
      valid({ dailySummaryEnabled: false, dailySummaryTime: time, itemRemindersEnabled: false }),
      true,
    );
  for (const time of [
    "24:00",
    "08:60",
    "8:00",
    "08:00\n",
    "08:00\r",
    "08:00\u2028",
    " 08:00",
    "08:00 ",
  ]) {
    assert.equal(
      valid({ dailySummaryEnabled: false, dailySummaryTime: time, itemRemindersEnabled: false }),
      false,
    );
    assert.throws(() => save(1, { time: "'" + time + "'" }), /Invalid notification preferences/);
  }
  db.sql(
    as(
      1,
      `do $$ declare t text; r bigint:=0; begin for t in select to_char(time '00:00'+make_interval(mins=>n),'HH24:MI') from generate_series(0,1439) n loop
    perform public.nest_save_notification_preferences('${id(10)}',gen_random_uuid(),r,false,t,false); r:=r+1; end loop; end $$`,
    ),
  );
  assert.equal(JSON.parse(read(1)).revision, 1440);
  save(2);
  db.sql(
    `update public.nest_notification_preferences set revision=9223372036854775807 where actor_id='${id(2)}'`,
  );
  assert.throws(
    () => save(2, { operation: 101, expected: "9223372036854775807" }),
    /preferences changed/,
  );
  assert.equal(
    db.sql(`select revision from public.nest_notification_preferences where actor_id='${id(2)}'`),
    "9223372036854775807",
  );
});
