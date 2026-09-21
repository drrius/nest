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

test("malformed, nonprospective or differently disclosed mandates never create rules", (t) => {
  const { db, input } = fixture(t);
  const base = input(400);
  for (const value of [
    null,
    {},
    { ...base, extra: true },
    { ...base, firstDueOn: "0000-01-01" },
    { ...base, ruleId: "bad" },
    { ...base, expectedRevision: 7 },
    { ...base, configuration: { ...base.configuration, receiptPath: "not-allowed" } },
    { ...base, configuration: { ...base.configuration, mode: null } },
    { ...base, configuration: { ...base.configuration, amountCentimes: "9007199254740992" } },
    { ...base, configuration: { ...base.configuration, amountCentimes: "100" } },
    { ...base, configuration: { ...base.configuration, payerId: id(3) } },
    { ...base, configuration: { ...base.configuration, categoryId: id(800) } },
    { ...base, configuration: { ...base.configuration, description: "\ufeff" } },
    { ...base, configuration: { ...base.configuration, startDate: "0001-01-01" } },
    { ...base, configuration: { ...base.configuration, startDate: "2026-02-30" } },
    {
      ...base,
      configuration: { ...base.configuration, schedule: { kind: "monthly", dayOfMonth: 32 } },
    },
  ])
    assert.throws(() => read(db, save(401, value)));
  assert.equal(db.sql("select count(*) from public.nest_recurring_rules"), "0");
  const created = read(db, save(402, base));
  db.sql(
    `update private.nest_recurring_execution set next_due_on=(clock_timestamp() at time zone 'Europe/Zurich')::date-1 where rule_id='${id(400)}'`,
  );
  assert.throws(
    () => read(db, save(403, { ...base, expectedRevision: created.revision })),
    /Resolve overdue cycles/,
  );
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "1");
});

test("pending, denied, expired, foreign and command-mismatched approvals never grant mandates", (t) => {
  const { db, input } = fixture(t);
  const value = input(500);
  const pending = db.sql(
    as(
      1,
      `select public.nest_propose_action('${id(10)}','${id(501)}','recurring.create',1,${json(value)})`,
    ),
  );
  assert.throws(() => read(db, execute(501, value, pending)), /Approval not valid/);
  db.sql(
    as(
      1,
      `select public.nest_decide_action('${pending}','${id(501)}','recurring.create',1,${json(value)},false)`,
    ),
  );
  assert.throws(() => read(db, execute(501, value, pending)), /Approval not valid/);
  const expired = approve(db, 502, value);
  db.sql(
    `update public.nest_action_approvals set expires_at=clock_timestamp()-interval '1 second' where id='${expired}'`,
  );
  assert.throws(() => read(db, execute(502, value, expired)), /Approval not valid/);
  const approved = approve(db, 503, value);
  assert.throws(() => read(db, execute(503, value, approved), 2), /Not authorized/);
  const wrongCommand = approve(db, 504, value, "recurring.update");
  assert.throws(() => read(db, execute(504, value, wrongCommand)), /Approval not valid/);
  assert.equal(db.sql("select count(*) from public.nest_recurring_rules"), "0");
});

test("competing approved edits serialize and preserve the losing approval for an honest conflict", async (t) => {
  const { db, input } = fixture(t),
    value = input(600);
  const created = read(db, save(601, value));
  const edits = ["First edit", "Second edit"].map((description) => ({
    ...value,
    expectedRevision: created.revision,
    configuration: { ...value.configuration, description },
  }));
  const approvals = edits.map((edit, i) => approve(db, 602 + i, edit, "recurring.update"));
  const results = await Promise.allSettled(
    edits.map((edit, i) => db.concurrent(as(1, execute(602 + i, edit, approvals[i])))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const losing = results.findIndex((r) => r.status === "rejected");
  assert.match(String(results[losing].reason), /rule changed/);
  assert.equal(
    db.sql(`select status from public.nest_action_approvals where id='${approvals[losing]}'`),
    "approved",
  );
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "2");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
