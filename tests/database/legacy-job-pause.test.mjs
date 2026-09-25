import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/legacy-job-pause-fixture.sql");
  db.file("supabase/migrations/20260923092657_native_legacy_job_pause.sql");
  return db;
}
const claim = "select private.claim_job('ensure_due_occurrences:test','ensure_due_occurrences')";
const pause = "select private.nest_set_legacy_job_paused('ensure_due_occurrences',true)";
test("legacy pause preserves claims, isolates jobs, fails closed and denies API control", (t) => {
  const db = fixture(t);
  const original = JSON.parse(db.sql(claim));
  assert.equal(original.decision, "run");
  db.sql(pause);
  assert.throws(() => db.sql(claim), /Legacy job paused or control unavailable/);
  assert.equal(db.sql("select count(*) from public.job_claims"), "1");
  assert.equal(
    JSON.parse(
      db.sql("select private.claim_job('retain_activity_events:test','retain_activity_events')"),
    ).decision,
    "run",
  );
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(() => db.sql(`set role ${role}; ${pause}`), /permission denied/);
  db.sql("select private.nest_set_legacy_job_paused('ensure_due_occurrences',false)");
  const recovered = JSON.parse(db.sql(claim));
  assert.equal(recovered.decision, "in_progress");
  assert.deepEqual(recovered.claim, original.claim);
  db.sql("delete from private.nest_legacy_job_control where job_kind='ensure_due_occurrences'");
  assert.throws(() => db.sql(claim), /Legacy job paused or control unavailable/);
  db.sql("select private.nest_set_legacy_job_paused('invoke_push_dispatch',true)");
  assert.throws(
    () => db.sql("select private.invoke_push_dispatch()"),
    /Legacy job paused or control unavailable/,
  );
});
test("legacy pause waits for the transaction holding a job claim", async (t) => {
  const db = fixture(t);
  const running = db.concurrent(
    `set application_name='nest-legacy-running'; begin; ${claim}; select pg_sleep(3); commit;`,
  );
  await waitFor(db, "application_name='nest-legacy-running' and wait_event='PgSleep'");
  const pausing = db.concurrent(
    `set application_name='nest-legacy-pausing'; set lock_timeout='8s'; set statement_timeout='9s'; ${pause}`,
  );
  await waitFor(db, "application_name='nest-legacy-pausing' and wait_event_type='Lock'");
  await Promise.all([running, pausing]);
  assert.equal(db.sql("select count(*) from public.job_claims"), "1");
  assert.throws(() => db.sql(claim), /Legacy job paused or control unavailable/);
});
async function waitFor(db, condition) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (db.sql(`select exists(select 1 from pg_stat_activity where ${condition})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Expected database wait: ${condition}`);
}
