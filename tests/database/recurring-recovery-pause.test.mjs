import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./recurring-worker-fixture.mjs";

test("owner pause blocks new automatic postings, preserves recovery and cannot be changed by API roles", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923090426_native_recurring_recovery_pause.sql");
  const pause = "select private.nest_set_recurring_execution_paused(true)";
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(() => f.db.sql(`set role ${role}; ${pause}`), /permission denied/);
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; update private.nest_recurring_execution_control set paused=false`,
        ),
      /permission denied/,
    );
  }
  f.db.sql(pause);
  assert.throws(() => f.execute(f.job()), /Automatic recurring execution paused/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_job_receipts"), "0");
  assert.deepEqual(f.execute(f.scan()).jobs, [f.input]);
  f.db.sql("select private.nest_set_recurring_execution_paused(false)");
  const posted = f.execute(f.job());
  f.db.sql(pause);
  assert.deepEqual(f.execute(f.job()), posted);
  assert.deepEqual(f.execute(f.job(701)).receipt, posted.receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});

test("missing execution control fails closed without posting or advancing the due cycle", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923090426_native_recurring_recovery_pause.sql");
  f.db.sql("delete from private.nest_recurring_execution_control");
  assert.throws(() => f.execute(f.job()), /Automatic recurring execution paused/);
  assert.throws(
    () => f.db.sql("select private.nest_set_recurring_execution_paused(false)"),
    /Execution control unavailable/,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.deepEqual(f.execute(f.scan()).jobs, [f.input]);
});

test("pause acknowledgment waits for an in-flight financial transaction to commit", async (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923090426_native_recurring_recovery_pause.sql");
  const posting = f.db.concurrent(
    f.worker(`set application_name='nest-posting-drain';
    begin; ${f.job()}; select pg_sleep(3); commit;`),
  );
  await waitFor(f.db, "application_name='nest-posting-drain' and wait_event='PgSleep'");
  const pausing = f.db.concurrent(`set application_name='nest-pausing-drain';
    set lock_timeout='8s'; set statement_timeout='9s';
    select private.nest_set_recurring_execution_paused(true)`);
  await waitFor(f.db, "application_name='nest-pausing-drain' and wait_event_type='Lock'");
  await Promise.all([posting, pausing]);
  assert.equal(f.db.sql("select paused from private.nest_recurring_execution_control"), "t");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_job_receipts"), "1");
  assert.equal(f.execute(f.job()).receipt.source, "automatic");
});

async function waitFor(db, condition) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (db.sql(`select exists(select 1 from pg_stat_activity where ${condition})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Database did not reach expected wait: ${condition}`);
}
