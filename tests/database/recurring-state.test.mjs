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
import { RecurringStateReceipt } from "../../packages/contracts/src/recurring-state.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
function fixture(t) {
  const f = mandates(t);
  f.db.file("supabase/migrations/20260921205157_native_recurring_fixed_cycle.sql");
  f.db.file("supabase/migrations/20260921210444_native_recurring_state_command.sql");
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const input = f.input(100, {
    startDate: today,
    schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
  });
  const saved = read(f.db, save(500, input));
  const change = {
    ruleId: input.ruleId,
    expectedRevision: saved.revision,
    expectedStatus: "active",
    action: "pause",
  };
  const state = (operation, value = change) =>
    `select public.nest_save_recurring_state('${id(10)}','${id(operation)}',${json(value)})`;
  const execute = (approval, value = change) =>
    `select public.nest_execute_recurring_state('${id(10)}','${id(600)}',${json(value)},${approval ? `'${approval}'` : "null"})`;
  const post = `select private.nest_post_fixed_cycle('${id(10)}','${input.ruleId}','${saved.revision}','${today}')`;
  const cursor = () => f.db.sql("select row_to_json(e) from private.nest_recurring_execution e");
  return { ...f, input, saved, change, state, execute, post, cursor };
}
test("simultaneous pauses create one durable state change, preserve coverage and invalidate the old mandate", async (t) => {
  const f = fixture(t),
    before = f.cursor();
  const rows = await Promise.all(
    Array.from({ length: 5 }, () => f.db.concurrent(as(1, f.state(600)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  const paused = results[0];
  assert.equal(Schema.is(RecurringStateReceipt)(paused), true);
  assert.equal(paused.status, "paused");
  assert.notEqual(paused.revision, f.saved.revision);
  assert.equal(f.cursor(), before);
  assert.throws(() => f.db.sql(f.post), /mandate changed/);
  assert.throws(
    () => read(f.db, save(601, { ...f.input, expectedRevision: f.saved.revision })),
    /rule changed/,
  );
  const cancelled = read(
    f.db,
    f.state(602, {
      ...f.change,
      expectedRevision: paused.revision,
      expectedStatus: "paused",
      action: "cancel",
    }),
  );
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(read(f.db, f.state(600)), paused);
  assert.equal(f.cursor(), before);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(
    f.db.sql(
      "select string_agg(change_kind,',' order by created_at) from public.nest_recurring_revisions",
    ),
    "configuration,pause,cancel",
  );
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_recurring_state_receipts")), "0");
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_recurring_revisions")), "0");
  assert.throws(
    () => f.db.sql("delete from public.nest_recurring_state_receipts"),
    /append.only|immutable|cannot|not allowed/i,
  );
});
test("state commands serialize against automatic posting and never reverse an already posted obligation", async (t) => {
  const f = fixture(t);
  const [posting, pause] = await Promise.allSettled([
    f.db.concurrent(f.post),
    f.db.concurrent(as(1, f.state(600))),
  ]);
  assert.equal(pause.status, "fulfilled");
  const count = f.db.sql("select count(*) from public.financial_events");
  if (posting.status === "fulfilled") {
    assert.equal(count, "1");
    assert.deepEqual(JSON.parse(f.db.sql(f.post)), JSON.parse(posting.value.stdout));
  } else {
    assert.match(String(posting.reason), /mandate changed/);
    assert.equal(count, "0");
    assert.throws(() => f.db.sql(f.post), /mandate changed/);
  }
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
  assert.equal(
    f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"),
    count === "1" ? "0" : "",
  );
});
test("exact AI approval is required and receipt failure rolls back stop, history and approval consumption", (t) => {
  const f = fixture(t),
    before = f.cursor();
  const approval = approve(f.db, 600, f.change, "recurring.pause");
  assert.throws(() => read(f.db, f.execute(null)), /approval required/);
  assert.throws(
    () => read(f.db, f.execute(approval, { ...f.change, action: "cancel" })),
    /Approval|approval/,
  );
  f.db.sql(
    "alter table public.nest_recurring_state_receipts add constraint fixture_state_failure check(false) not valid",
  );
  assert.throws(() => read(f.db, f.execute(approval)), /fixture_state_failure/);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "approved");
  assert.equal(f.cursor(), before);
  f.db.sql(
    "alter table public.nest_recurring_state_receipts drop constraint fixture_state_failure",
  );
  const result = read(f.db, f.execute(approval));
  assert.equal(result.approvalId, approval);
  assert.equal(f.db.sql("select status from public.nest_action_approvals"), "consumed");
  assert.deepEqual(read(f.db, f.execute(approval)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("stale or substituted state inputs, foreign households and revoked members cannot stop rules", (t) => {
  const f = fixture(t);
  for (const patch of [
    { expectedRevision: id(999) },
    { ruleId: id(999) },
    { expectedStatus: "paused" },
    { action: "resume" },
    { approved: true },
  ])
    assert.throws(() => read(f.db, f.state(600, { ...f.change, ...patch })));
  assert.throws(() => read(f.db, f.state(600), 3), /Not authorized/);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  const paused = read(f.db, f.state(600));
  assert.throws(
    () => read(f.db, f.state(600, { ...f.change, action: "cancel" })),
    /operation changed/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(f.db, f.state(600)), /Not authorized/);
  assert.equal(f.db.sql(as(1, "select count(*) from public.nest_recurring_state_receipts")), "0");
  assert.equal(paused.status, "paused");
});
