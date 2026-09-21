import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  fixture as mandates,
  read,
  save,
  as,
  id,
  json,
  approve,
} from "./recurring-mandate-fixture.mjs";
import { planRecurringResume } from "../../packages/domain/src/money/recurring-resume.ts";
import { RecurringResumeReceipt } from "../../packages/contracts/src/recurring-resume.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
function fixture(t, mode = "fixed", consumed = false) {
  const f = mandates(t);
  for (const migration of [
    "20260921205157_native_recurring_fixed_cycle",
    "20260921210444_native_recurring_state_command",
    "20260921211106_native_recurring_state_recovery",
    "20260921215304_native_recurring_resume_command",
  ])
    f.db.file(`supabase/migrations/${migration}.sql`);
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const rule = f.input(100, {
    startDate: today,
    schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    ...(mode === "variable" ? { mode, amountCentimes: null, allocations: null } : {}),
  });
  const created = read(f.db, save(500, rule));
  if (consumed)
    f.db.sql(
      `select private.nest_post_fixed_cycle('${id(10)}','${rule.ruleId}','${created.revision}','${rule.firstDueOn}')`,
    );
  const pause = (revision, op = 501) =>
    read(
      f.db,
      `select public.nest_save_recurring_state('${id(10)}','${id(op)}',${json({ ruleId: rule.ruleId, expectedRevision: revision, expectedStatus: "active", action: "pause" })})`,
    );
  const paused = pause(created.revision);
  const input = {
    ruleId: rule.ruleId,
    expectedRevision: paused.revision,
    expectedStatus: "paused",
    action: "resume",
    resumeFrom: today,
    firstDueOn: rule.firstDueOn,
  };
  return { ...f, rule, created, pause, paused, input, today };
}
const resume = (input, op = 600) =>
  `select public.nest_save_recurring_resume('${id(10)}','${id(op)}',${json(input)})`;
const execute = (input, approval, op = 600) =>
  `select public.nest_execute_recurring_resume('${id(10)}','${id(op)}',${json(input)},${approval === null ? "null" : `'${approval}'`})`;
test("concurrent resumption creates one fresh mandate, preserves configuration/history and replays after a later pause", async (t) => {
  const f = fixture(t);
  const rows = await Promise.all(
    Array.from({ length: 5 }, () => f.db.concurrent(as(2, resume(f.input)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  const result = results[0];
  assert.equal(Schema.is(RecurringResumeReceipt)(result), true);
  assert.deepEqual(result.configuration, f.rule.configuration);
  assert.equal(f.db.sql("select authorized_by::text from public.nest_recurring_rules"), id(2));
  assert.equal(
    f.db.sql(
      "select change_kind from public.nest_recurring_revisions order by created_at desc limit 1",
    ),
    "resume",
  );
  assert.equal(
    f.db.sql(
      "select resume_from::text from public.nest_recurring_revisions where change_kind='resume'",
    ),
    f.today,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const posted = JSON.parse(
    f.db.sql(
      `select private.nest_post_fixed_cycle('${id(10)}','${f.rule.ruleId}','${result.revision}','${f.input.firstDueOn}')`,
    ),
  );
  assert.equal(posted.authorizedBy, id(2));
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  f.pause(result.revision, 601);
  assert.deepEqual(read(f.db, resume(f.input), 2), result);
  assert.throws(() => read(f.db, resume({ ...f.input, firstDueOn: "2099-01-01" }), 2));
  assert.throws(() =>
    f.db.sql(
      "update public.nest_recurring_revisions set resume_from=current_date where change_kind='resume'",
    ),
  );
});
test("resumption skips old backlog and consumed coverage without inventing another expense", (t) => {
  const f = fixture(t, "fixed", true);
  // Real posted coverage; simulate a stale paused cursor in this disposable fixture.
  const covered = f.db.sql("select covered_through::text from private.nest_recurring_execution");
  f.db.sql(
    "update private.nest_recurring_execution set next_due_on=current_date-interval '60 days'",
  );
  const plan = planRecurringResume(f.rule.configuration.schedule, {
    today: f.today,
    startDate: f.rule.configuration.startDate,
    coveredThrough: covered,
  });
  const input = { ...f.input, firstDueOn: plan.cycle.dueOn };
  assert.throws(() => read(f.db, resume(f.input)));
  const receipt = read(f.db, resume(input));
  assert.equal(Schema.is(RecurringResumeReceipt)(receipt), true);
  assert.equal(
    f.db.sql("select covered_through::text from private.nest_recurring_execution"),
    covered,
  );
  assert.equal(
    f.db.sql("select next_due_on::text from private.nest_recurring_execution"),
    plan.cycle.dueOn,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("resumption needs current membership, paused revision, prospective exact date and unabandoned intent", (t) => {
  const f = fixture(t);
  for (const patch of [
    { action: "pause" },
    { expectedStatus: "active" },
    { expectedRevision: f.created.revision },
    { resumeFrom: "2000-01-01" },
    { firstDueOn: "2099-01-01" },
    { approved: true },
  ])
    assert.throws(() => read(f.db, resume({ ...f.input, ...patch })));
  assert.throws(() => read(f.db, resume(f.input), 3));
  read(f.db, `select public.nest_cancel_recurring_state_save('${id(10)}','${id(600)}')`);
  assert.throws(() => read(f.db, resume(f.input)));
  read(
    f.db,
    `select public.nest_save_recurring_state('${id(10)}','${id(601)}',${json({ ruleId: f.input.ruleId, expectedRevision: f.paused.revision, expectedStatus: "paused", action: "cancel" })})`,
  );
  assert.throws(() => read(f.db, resume(f.input, 602)));
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "cancelled");
});
test("exact AI approval and state receipt failure preserve atomic authorization and variable policy", (t) => {
  const f = fixture(t, "variable"),
    approval = approve(f.db, 600, f.input, "recurring.resume");
  assert.throws(() => read(f.db, execute(f.input, null)));
  f.db
    .sql(`create function public.fail_resume() returns trigger language plpgsql as $$ begin if new.result->'change'->>'action'='resume' then raise exception 'fixture failure'; end if; return new; end $$;
    create trigger fail_resume before insert on public.nest_recurring_state_receipts for each row execute function public.fail_resume()`);
  assert.throws(() => read(f.db, execute(f.input, approval)));
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  f.db.sql("drop trigger fail_resume on public.nest_recurring_state_receipts");
  const result = read(f.db, execute(f.input, approval));
  assert.equal(result.configuration.amountCentimes, null);
  assert.equal(result.configuration.allocations, null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(f.db, execute(f.input, approval)));
});
