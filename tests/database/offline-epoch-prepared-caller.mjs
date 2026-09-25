import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

export async function assertPreparedCallerFenced(db, { signature, statement, migration, ids }) {
  const oid = () => db.sql(`select '${signature}'::regprocedure::oid`);
  const before = oid();
  const running = db
    .concurrent(`set application_name='epoch-prepared-caller';
    set role authenticated;
    set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
    prepare old_command(uuid) as ${statement};
    begin; execute old_command('${ids[0]}'); commit;
    select pg_sleep(1.5);
    execute old_command('${ids[0]}');
    execute old_command('${ids[1]}');`)
    .then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
  await waitForPreparedCaller(db);
  db.file(`supabase/migrations/${migration}`);
  assert.equal(oid(), before, "the original private function identity must survive migration");
  db.sql(`begin; select private.nest_set_household_writes_frozen(true);
    select private.nest_rotate_offline_epoch();
    select private.nest_set_household_writes_frozen(false); commit;`);
  const { error } = await running;
  assert.ok(error, "prepared old command must reject unreceived epochless intent");
  assert.match(error.stderr, /reconciliation/);
  const receipts = error.stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"));
  assert.equal(receipts.length, 2, "warm command and exact historical replay both succeed");
  assert.deepEqual(JSON.parse(receipts[1]), JSON.parse(receipts[0]));
}

async function waitForPreparedCaller(db) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (
      db.sql(`select count(*) from pg_stat_activity
      where application_name='epoch-prepared-caller' and wait_event='PgSleep'`) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail("Prepared caller did not finish its warm command");
}
