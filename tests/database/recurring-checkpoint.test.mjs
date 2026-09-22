import assert from "node:assert/strict";
import test from "node:test";
import { fixture as worker, id, json, as } from "./recurring-worker-fixture.mjs";
function fixture(t) {
  const f = worker(t);
  f.db.file("supabase/migrations/20260922002959_native_recurring_worker_checkpoint.sql");
  const claim = (n = 900, budget = 2) =>
    `select public.nest_claim_recurring_run('${id(n)}',${budget})`;
  const finish = (report, n = 900) =>
    `select public.nest_finish_recurring_run('${id(n)}',${json(report)})`;
  const cursor = { dueOn: f.today, householdId: id(10), ruleId: id(300) };
  const report = { after: cursor, complete: false, processed: 1, failed: 0, scanFailure: null };
  return { ...f, claim, finish, cursor, report };
}
test("service-only lease, exact claim/reply recovery and persisted sweep continuation", (t) => {
  const f = fixture(t),
    claim = f.execute(f.claim());
  assert.equal(claim.after, null);
  assert.deepEqual(f.execute(f.claim()), claim);
  assert.throws(() => f.execute(f.claim(901)), /already running/);
  assert.throws(() => f.execute(f.claim(900, 3)), /identity reused/);
  assert.throws(() => f.db.sql(as(1, f.claim(901))), /permission denied/);
  assert.throws(() => f.db.sql(`set role anon; ${f.claim(901)}`), /permission denied/);
  assert.throws(
    () => f.db.sql(f.worker("select * from private.nest_recurring_runs")),
    /permission denied/,
  );
  const done = f.execute(f.finish(f.report));
  assert.deepEqual(f.execute(f.finish(f.report)), done);
  assert.deepEqual(f.execute(f.claim(901)).after, f.cursor);
  assert.deepEqual(f.execute(f.finish(f.report)), done);
  assert.throws(() => f.execute(f.finish({ ...f.report, failed: 1 })), /report changed/);
  const complete = { after: null, complete: true, processed: 0, failed: 0, scanFailure: null };
  f.execute(f.finish(complete, 901));
  assert.equal(f.execute(f.claim(902)).after, null);
});
test("expired or superseded worker cannot overwrite checkpoint; concurrent claim has one winner", async (t) => {
  const f = fixture(t);
  const contenders = await Promise.all(
    [900, 901].map((n) =>
      f.db.concurrent(f.worker(f.claim(n))).catch((error) => ({ stderr: error.stderr })),
    ),
  );
  assert.equal(contenders.filter((v) => !v.stderr.includes("ERROR")).length, 1);
  const owner = Number(
    f.db.sql("select right(owner::text,3)::integer from private.nest_recurring_sweep"),
  );
  f.db.sql(
    "update private.nest_recurring_sweep set expires_at=clock_timestamp()-interval '1 second'",
  );
  assert.throws(() => f.execute(f.claim(owner)), /no longer active/);
  assert.throws(() => f.execute(f.finish(f.report, owner)), /lease expired/);
  assert.equal(f.execute(f.claim(902)).after, null);
  assert.throws(() => f.execute(f.finish(f.report, owner)), /lease expired/);
  f.execute(f.finish(f.report, 902));
  assert.deepEqual(f.execute(f.claim(903)).after, f.cursor);
});
test("invalid reports cannot release lease or move cursor; failed scans retain checkpoint", (t) => {
  const f = fixture(t);
  f.execute(f.claim());
  for (const report of [
    { ...f.report, processed: 3 },
    { ...f.report, processed: 0 },
    { ...f.report, failed: 2 },
    { ...f.report, processed: 1.5 },
    { ...f.report, after: null },
    { ...f.report, complete: true },
    { ...f.report, scanFailure: "secret" },
    { ...f.report, extra: true },
    { ...f.report, after: { ...f.cursor, revision: id(4) } },
  ])
    assert.throws(() => f.execute(f.finish(report)));
  assert.throws(() => f.execute(f.claim(901)), /already running/);
  f.execute(f.finish(f.report));
  f.execute(f.claim(901));
  assert.throws(() => f.execute(f.finish(f.report, 901)), /did not advance/);
  f.execute(f.finish({ ...f.report, processed: 0, scanFailure: "unavailable" }, 901));
  assert.deepEqual(f.execute(f.claim(902)).after, f.cursor);
});

test("checkpoint write failure rolls back completion receipt and preserves active lease", (t) => {
  const f = fixture(t);
  f.execute(f.claim());
  f.db.sql(`create function private.fail_checkpoint() returns trigger language plpgsql as $$
    begin raise exception 'Injected checkpoint failure'; end $$;
    create trigger fail_checkpoint before update on private.nest_recurring_sweep
    for each row execute function private.fail_checkpoint();`);
  assert.throws(() => f.execute(f.finish(f.report)), /Injected checkpoint failure/);
  assert.equal(
    f.db.sql(`select report is null from private.nest_recurring_runs where id='${id(900)}'`),
    "t",
  );
  assert.equal(f.db.sql("select cursor is null from private.nest_recurring_sweep"), "t");
  f.db.sql("drop trigger fail_checkpoint on private.nest_recurring_sweep");
  assert.deepEqual(f.execute(f.claim()).after, null);
  f.execute(f.finish(f.report));
  assert.deepEqual(f.execute(f.claim(901)).after, f.cursor);
});
