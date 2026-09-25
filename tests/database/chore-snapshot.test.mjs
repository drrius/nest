import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { choreTransferFiles } from "./chore-transfer-files.mjs";
import { assertEpochSnapshotRace } from "./offline-epoch-snapshot-race.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of choreTransferFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const snapshot = () => JSON.parse(db.sql(as(`select public.nest_chore_snapshot('${id(10)}')`)));
const created = JSON.parse(
  db.sql(
    as(`select public.nest_create_routine('${id(10)}','${id(100)}',
  '${JSON.stringify({ title: "Snapshot race", schedule: { kind: "daily" }, assignment: { policy: "assigned", memberId: id(1) } })}'::jsonb)`),
  ),
);
const current = JSON.parse(
  db.sql(
    `select row_to_json(o) from public.routine_occurrences o where routine_id='${created.routineId}' and role='current'`,
  ),
);
const request = JSON.parse(
  db.sql(
    as(`select public.nest_chore_transfer('${id(10)}','${id(101)}','request',
  ${json({ occurrenceId: current.id, expectedDueDate: current.due_date, recipientId: id(2) })})`),
  ),
);

test("snapshot is tenant-scoped, authenticated and coherent before acceptance", () => {
  assert.throws(
    () => db.sql(as(`select public.nest_chore_snapshot('${id(11)}')`)),
    /Not authorized/,
  );
  assert.throws(
    () => db.sql(as(`select public.nest_chore_snapshot('${id(10)}')`, id(3))),
    /Not authorized/,
  );
  assert.throws(
    () => db.sql(`set role anon; select public.nest_chore_snapshot('${id(10)}')`),
    /permission denied/,
  );
  const before = snapshot();
  assert.equal(before.chores[0].assigneeId, id(1));
  assert.equal(before.transfers[0].requestId, request.requestId);
});
test("an acceptance committed while an in-flight snapshot waits cannot mix old owner and missing request", async () => {
  const holder = db.concurrent(`set application_name='snapshot-holder'; begin;
    select pg_advisory_xact_lock(71527); select pg_sleep(0.8); commit;`);
  await waitFor("snapshot-holder", "PgSleep");
  const reading = db.concurrent(
    as(`set application_name='snapshot-reader';
    with barrier as materialized (select pg_advisory_xact_lock(71527))
    select public.nest_chore_snapshot('${id(10)}') from barrier`),
  );
  await waitFor("snapshot-reader", "advisory");
  db.sql(
    as(
      `select public.nest_chore_transfer('${id(10)}','${id(102)}','accept',
    ${json({ requestId: request.requestId })})`,
      id(2),
    ),
  );
  await holder;
  const old = JSON.parse((await reading).stdout.trim());
  assert.equal(old.chores[0].assigneeId, id(1));
  assert.equal(old.transfers[0].requestId, request.requestId);
  const fresh = snapshot();
  assert.equal(fresh.chores[0].assigneeId, id(2));
  assert.deepEqual(fresh.transfers, []);
});
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

test("chore data and epoch share the original snapshot across committed rotation", async () => {
  for (const file of [
    "20260925185000_native_household_write_barrier.sql",
    "20260925202107_native_offline_cutover_epoch.sql",
    "20260925204211_native_chore_epoch_snapshot.sql",
  ])
    db.file(`supabase/migrations/${file}`);
  const { after } = await assertEpochSnapshotRace(
    db,
    as(`select public.nest_chore_epoch_snapshot('${id(10)}')`),
    `update public.routines set title='After epoch rotation' where id='${created.routineId}'`,
  );
  assert.equal(after.chores[0].title, "After epoch rotation");
});
