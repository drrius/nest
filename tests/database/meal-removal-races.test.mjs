import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, as, week, command } from "./meal-removal-fixture.mjs";
const { db, add, preparation, remove } = fixture();
after(() => db.stop());
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
test("legacy edit committed while removal waits invalidates the whole week", async () => {
  const input = add(500);
  const editing = db.concurrent(
    `set application_name='legacy-edit-held'; begin; update public.meal_plan_entries set title_snapshot='Partner edit' where id='${input.entryId}'; select pg_sleep(0.7); commit`,
  );
  await waitFor("legacy-edit-held", "PgSleep");
  const removing = db.concurrent(
    `set application_name='removal-waiting'; ${command(id(501), input)}`,
  );
  const rejected = assert.rejects(removing, /Meal week changed/);
  await waitFor("removal-waiting", "transactionid");
  await editing;
  await rejected;
  assert.equal(
    db.sql(`select removed_at is null from public.meal_plan_entries where id='${input.entryId}'`),
    "t",
  );
});
test("entry lock contention rolls back the command and remains safely retryable", async () => {
  const input = add(510);
  const held = db.concurrent(
    `set application_name='meal-lock-held'; begin; select id from public.meal_plan_entries where id='${input.entryId}' for update; select pg_sleep(0.5); commit`,
  );
  await waitFor("meal-lock-held", "PgSleep");
  await assert.rejects(
    db.concurrent(`set lock_timeout='30ms'; ${command(id(511), input)}`),
    /Meal week changed/,
  );
  assert.equal(
    db.sql(
      `select count(*) from public.nest_meal_removal_receipts where operation_id='${id(511)}'`,
    ),
    "0",
  );
  await held;
  assert.equal(remove(id(511), input).removed, true);
});
test("paused and archived one-off preparation closes without generating successors", () => {
  for (const [n, column] of [
    [520, "paused_at"],
    [530, "archived_at"],
  ]) {
    const input = add(n),
      occurrence = preparation(input.entryId, id(n + 1));
    db.sql(
      `update public.routines set ${column}=now() where id=(select routine_id from public.routine_occurrences where id='${occurrence}')`,
    );
    assert.equal(remove(id(n + 2), input).skippedPreparationId, occurrence);
    assert.equal(
      db.sql(
        `select count(*) from public.routine_occurrences where routine_id=(select routine_id from public.routine_occurrences where id='${occurrence}') and status='open'`,
      ),
      "0",
    );
  }
});
test("rescheduled preparation retains identity and dates when meal removal skips it", () => {
  const input = add(540),
    occurrence = preparation(input.entryId, id(541));
  db.sql(
    as(
      `select public.reschedule_occurrence('${occurrence}','2030-01-08','rescheduled-preparation')`,
    ),
  );
  assert.equal(remove(id(542), input).skippedPreparationId, occurrence);
  assert.equal(
    db.sql(
      `select original_due_date::text||':'||due_date::text||':'||status from public.routine_occurrences where id='${occurrence}'`,
    ),
    `${week}:2030-01-08:skipped`,
  );
});
