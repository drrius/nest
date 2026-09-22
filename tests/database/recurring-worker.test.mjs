import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture, id, as, json } from "./recurring-worker-fixture.mjs";
import { FixedJobPage, FixedJobResult } from "../../packages/contracts/src/recurring-worker.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url)),
  Schema = require("effect/Schema");
test("only server role discovers/executes fixed cycles and concurrent jobs retain one financial posting", async (t) => {
  const f = fixture(t),
    page = f.execute(f.scan());
  assert.equal(Schema.is(FixedJobPage)(page), true);
  assert.deepEqual(page.jobs, [f.input]);
  for (const sql of [f.scan(), f.job()]) {
    assert.throws(() => f.db.sql(as(1, sql)), /permission denied/);
    assert.throws(() => f.db.sql(`set role anon; ${sql}`), /permission denied/);
  }
  const rows = await Promise.all(
    [700, 700, 701, 702].map((n) => f.db.concurrent(f.worker(f.job(n)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) {
    assert.equal(Schema.is(FixedJobResult)(result), true);
    assert.equal(result.receipt.eventId, results[0].receipt.eventId);
    assert.equal(result.receipt.authorizedBy, id(1));
    assert.equal(result.worker, "recurring-scheduler");
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_job_receipts"), "3");
  assert.deepEqual(f.execute(f.job()), results[0]);
  assert.throws(() => f.execute(f.job(700, { ...f.input, revision: id(999) })), /reused/);
  assert.throws(
    () => f.db.sql(f.worker("select * from private.nest_recurring_job_receipts")),
    /permission denied/,
  );
  assert.equal(f.execute(f.scan()).jobs.length, 0);
});
test("job audit failure rolls back ledger and cursor; current mandate checks block stale and variable execution", (t) => {
  const f = fixture(t);
  f.db.sql("alter table private.nest_recurring_job_receipts add constraint fail_job check(false)");
  assert.throws(() => f.execute(f.job()), /fail_job/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.deepEqual(f.execute(f.scan()).jobs, [f.input]);
  f.db.sql("alter table private.nest_recurring_job_receipts drop constraint fail_job");
  for (const patch of [
    { revision: id(999) },
    { householdId: id(11) },
    { dueOn: "2099-01-01" },
    { dueOn: "infinity" },
    { extra: true },
  ])
    assert.throws(() => f.execute(f.job(710, { ...f.input, ...patch })));
  for (const status of ["paused", "cancelled"]) {
    f.db.sql(`update public.nest_recurring_rules set status='${status}'`);
    assert.equal(f.execute(f.scan()).jobs.length, 0);
    assert.throws(() => f.execute(f.job()), /mandate changed/);
  }
  f.db.sql("update public.nest_recurring_rules set status='active'");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.execute(f.job()), /two current members/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("bounded scan visits all same-day rules and rejects malformed cursors without financial effects", (t) => {
  const f = fixture(t);
  for (const n of [301, 302])
    f.record(`select public.nest_save_recurring('${id(10)}','${id(n + 1000)}',${json(f.rule(n))})`);
  let after = null;
  const seen = [];
  do {
    const page = f.execute(f.scan(1, after));
    assert.equal(Schema.is(FixedJobPage)(page), true);
    seen.push(...page.jobs.map((job) => job.ruleId));
    after = page.next;
  } while (after);
  assert.deepEqual(seen, [id(300), id(301), id(302)]);
  for (const limit of [0, 101]) assert.throws(() => f.execute(f.scan(limit)), /limit/);
  assert.throws(() => f.execute(f.scan(1, { dueOn: f.today, ruleId: id(300) })), /cursor/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

test("downtime catch-up follows only the retained authorized cursor and remains exactly once", (t) => {
  const f = fixture(t),
    ruleId = id(900),
    revision = id(901);
  const start = f.db.sql(
    "select ((clock_timestamp() at time zone 'Europe/Zurich')::date-21)::text",
  );
  const weekday = Number(
    f.db.sql("select extract(isodow from (clock_timestamp() at time zone 'Europe/Zurich')::date)"),
  );
  const config = {
    ...f.rule().configuration,
    startDate: start,
    schedule: { kind: "weekly", weekday },
  };
  // Fixture represents an authorization made three weeks before this process was available.
  f.db
    .sql(`insert into public.nest_recurring_rules values('${id(10)}','${ruleId}','${revision}',${json(config)},'active','${id(1)}','${start}'::timestamptz);
    insert into public.nest_recurring_revisions(household_id,rule_id,revision,authorized_by,configuration,first_due_on,created_at) values('${id(10)}','${ruleId}','${revision}','${id(1)}',${json(config)},'${start}','${start}'::timestamptz);
    insert into private.nest_recurring_execution values('${id(10)}','${ruleId}',null,'${start}')`);
  const posted = [];
  for (let n = 0; n < 5; n++) {
    const next = f.execute(f.scan()).jobs.find((job) => job.ruleId === ruleId);
    if (!next) break;
    const result = f.execute(f.job(910 + n, next));
    posted.push(result);
    assert.deepEqual(f.execute(f.job(910 + n, next)), result);
  }
  assert.equal(posted.length, 4);
  assert.equal(posted[0].input.dueOn, start);
  assert.equal(posted.at(-1).input.dueOn, f.today);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "4");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.throws(
    () => f.execute(f.job(999, { ...posted[0].input, dueOn: "2000-01-01" })),
    /next authorized/,
  );
});
test("manual consumption fences a captured worker job and variable mandates never enter automatic work", (t) => {
  const f = fixture(t),
    source = f.source();
  f.record(
    f.command(
      {
        ruleId: f.input.ruleId,
        expectedRevision: f.input.revision,
        dueOn: f.today,
        sourceEventId: source,
      },
      750,
    ),
  );
  assert.throws(() => f.execute(f.job()), /already confirmed explicitly/);
  const rule = f.rule(301);
  Object.assign(rule.configuration, { mode: "variable", amountCentimes: null, allocations: null });
  const receipt = f.record(
    `select public.nest_save_recurring('${id(10)}','${id(751)}',${json(rule)})`,
  );
  assert.equal(f.execute(f.scan()).jobs.length, 0);
  assert.throws(
    () => f.execute(f.job(752, { ...f.input, ruleId: rule.ruleId, revision: receipt.revision })),
    /mandate changed/,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_job_receipts"), "0");
});
test("pagination does not drop another household using the same rule ID and due date", (t) => {
  const f = fixture(t);
  f.db.sql(
    `insert into auth.users values('${id(4)}'); insert into public.household_members(household_id,user_id,display_name) values('${id(20)}','${id(4)}','Fourth')`,
  );
  const rule = f.rule();
  Object.assign(rule.configuration, {
    payerId: id(3),
    allocations: [
      { memberId: id(3), centimes: "51" },
      { memberId: id(4), centimes: "50" },
    ],
  });
  f.record(`select public.nest_save_recurring('${id(20)}','${id(650)}',${json(rule)})`, 3);
  const first = f.execute(f.scan(1)),
    second = f.execute(f.scan(1, first.next));
  assert.equal(first.jobs[0].householdId, id(10));
  assert.equal(second.jobs[0].householdId, id(20));
  assert.equal(first.jobs[0].ruleId, second.jobs[0].ruleId);
  assert.equal(second.next, null);
  assert.equal(Schema.is(FixedJobPage)(second), true);
});
