import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

export async function assertEpochSnapshotRace(db, read, update) {
  const before = JSON.parse(db.sql(read));
  const holder = db.concurrent(`set application_name='epoch-snapshot-holder'; begin;
    select pg_advisory_xact_lock(71903); select pg_sleep(1.2); commit;`);
  await waitFor(db, "epoch-snapshot-holder", "PgSleep");
  const reading = db.concurrent(`set application_name='epoch-snapshot-reader';
    set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    with barrier as materialized(select pg_advisory_xact_lock(71903))
    ${read.slice(read.lastIndexOf("select "))} from barrier;`);
  await waitFor(db, "epoch-snapshot-reader", "advisory");
  db.sql(`begin; select private.nest_set_household_writes_frozen(true);
    select private.nest_rotate_offline_epoch();
    select private.nest_set_household_writes_frozen(false); ${update}; commit;`);
  await holder;
  assert.deepEqual(JSON.parse((await reading).stdout.trim()), before);
  const after = JSON.parse(db.sql(read));
  assert.notEqual(after.offlineEpoch, before.offlineEpoch);
  return { before, after };
}

async function waitFor(db, application, event) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      db.sql(`select count(*) from pg_stat_activity
      where application_name='${application}' and wait_event='${event}'`) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing epoch snapshot barrier ${application}/${event}`);
}
