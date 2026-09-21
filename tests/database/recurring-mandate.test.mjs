import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  as,
  id,
  json,
  save,
  execute,
  read,
  approve,
} from "./recurring-mandate-fixture.mjs";

test("direct mandate authorization is retry safe, immutable and isolated without posting money", async (t) => {
  const { db, input } = fixture(t),
    value = input(100);
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => db.concurrent(as(1, save(101, value)))),
  );
  const values = responses.map(({ stdout }) => JSON.parse(stdout.trim()));
  assert.equal(new Set(values.map((r) => r.revision)).size, 1);
  assert.deepEqual(values[0].rule, value);
  assert.equal(values[0].approvalId, null);
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
  assert.throws(
    () => read(db, save(101, input(100, { description: "Changed" }))),
    /operation changed/,
  );
  assert.throws(() => read(db, save(102, value), 2), /rule changed/);
  assert.equal(db.sql(as(2, "select count(*) from public.nest_recurring_rules")), "1");
  assert.equal(db.sql(as(3, "select count(*) from public.nest_recurring_rules")), "0");
  assert.equal(db.sql(as(2, "select count(*) from public.nest_recurring_receipts")), "0");
  assert.throws(() => read(db, save(102, input(103)), 3), /Not authorized/);
  assert.throws(() => db.sql("set role anon; " + save(102, input(103))), /permission denied/);
  for (const table of [
    "nest_recurring_rules",
    "nest_recurring_revisions",
    "nest_recurring_receipts",
  ])
    assert.throws(() => db.sql(as(1, `delete from public.${table}`)), /permission denied/);
  for (const table of ["nest_recurring_revisions", "nest_recurring_receipts"])
    assert.throws(() => db.sql(`delete from public.${table}`), /append-only/);
  assert.throws(
    () => db.sql(as(1, "select * from private.nest_recurring_execution")),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `select private.nest_set_recurring('${id(10)}','${id(104)}',${json(input(104))},null)`,
        ),
      ),
    /permission denied/,
  );
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(db, save(101, value)), /Not authorized/);
  assert.equal(db.sql(as(1, "select count(*) from public.nest_recurring_revisions")), "0");
});

test("AI mandate edits require current revision and exact approval; authorization and receipt roll back together", (t) => {
  const { db, input } = fixture(t),
    value = input(200);
  assert.throws(() => read(db, execute(201, value, null)), /approval required/);
  const approval = approve(db, 201, value);
  assert.throws(
    () => read(db, execute(201, input(200, { description: "Changed" }), approval)),
    /Approval not valid/,
  );
  db.sql(
    "alter table public.nest_recurring_receipts add constraint fixture_reject check(false) not valid",
  );
  assert.throws(() => read(db, execute(201, value, approval)), /fixture_reject/);
  assert.equal(db.sql("select count(*) from public.nest_recurring_rules"), "0");
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "approved",
  );
  db.sql("alter table public.nest_recurring_receipts drop constraint fixture_reject");
  const created = read(db, execute(201, value, approval));
  db.sql(
    `update public.nest_action_approvals set expires_at=now()-interval '1 day' where id='${approval}'`,
  );
  assert.deepEqual(read(db, execute(201, value, approval)), created);
  assert.throws(() => read(db, save(201, value)), /operation changed/);
  const edit = input(
    200,
    { description: "Revised mandate" },
    { expectedRevision: created.revision },
  );
  const staleApproval = approve(db, 202, edit, "recurring.update");
  const updated = read(db, save(203, edit), 2);
  assert.notEqual(updated.revision, created.revision);
  assert.throws(() => read(db, execute(202, edit, staleApproval)), /rule changed/);
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${staleApproval}'`),
    "approved",
  );
  const latest = { ...edit, expectedRevision: updated.revision };
  const editApproval = approve(db, 204, latest, "recurring.update");
  const result = read(db, execute(204, latest, editApproval));
  assert.equal(result.approvalId, editApproval);
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "3");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});

test("variable rules do not authorize an amount, edits preserve coverage and never silently resume", (t) => {
  const { db, input } = fixture(t);
  const variable = input(300, { mode: "variable", amountCentimes: null, allocations: null });
  const created = read(db, save(301, variable));
  assert.throws(() => read(db, save(302, input(303, { mode: "variable" }))), /per-cycle amount/);
  db.sql(
    `update private.nest_recurring_execution set covered_through=next_due_on,next_due_on=next_due_on+1 where rule_id='${id(300)}'`,
  );
  const coverage = db.sql(
    `select covered_through from private.nest_recurring_execution where rule_id='${id(300)}'`,
  );
  const edit = { ...variable, expectedRevision: created.revision };
  assert.throws(() => read(db, save(304, edit)), /First recurring cycle changed/);
  const expected = db.sql(
    `select private.nest_recurring_cycle(${json(variable.configuration.schedule)},'${variable.configuration.startDate}','${coverage}')->>'dueOn'`,
  );
  db.sql(`update public.nest_recurring_rules set status='paused' where id='${id(300)}'`);
  const changed = read(db, save(305, { ...edit, firstDueOn: expected }));
  assert.equal(changed.status, "paused");
  assert.equal(
    db.sql(
      `select covered_through from private.nest_recurring_execution where rule_id='${id(300)}'`,
    ),
    coverage,
  );
  assert.equal(
    db.sql(`select revision from public.nest_recurring_rules where id='${id(300)}'`),
    changed.revision,
  );
  db.sql(
    `update private.nest_recurring_execution set next_due_on=next_due_on+1 where rule_id='${id(300)}'`,
  );
  assert.equal(
    db.sql(`select revision from public.nest_recurring_rules where id='${id(300)}'`),
    changed.revision,
  );
  db.sql(`update public.nest_recurring_rules set status='cancelled' where id='${id(300)}'`);
  assert.throws(
    () =>
      read(db, save(306, { ...edit, expectedRevision: changed.revision, firstDueOn: expected })),
    /rule changed/,
  );
});
