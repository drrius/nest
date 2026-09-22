import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as, json } from "./legacy-adoption-command-fixture.mjs";
import {
  LegacyAdoptionReceipt,
  LegacyAdoptionRecovery,
} from "../../packages/contracts/src/legacy-adoption-command.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url)),
  Schema = require("effect/Schema");
test("explicit adoption preserves identity and source history with one immutable mandate under concurrent retries", async (t) => {
  const f = fixture(t);
  f.draft(900, "dismissed", "2026-01-31");
  const value = f.input(),
    before = f.db.sql("select row_to_json(d) from public.expense_drafts d");
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () =>
      f.db.concurrent(as(1, f.command(value))).then((row) => JSON.parse(row.stdout)),
    ),
  );
  for (const receipt of receipts) {
    assert.deepEqual(receipt, receipts[0]);
    assert.equal(Schema.is(LegacyAdoptionReceipt)(receipt), true);
  }
  assert.equal(f.context().adoption.nativeRuleId, id(800));
  assert.equal(f.db.sql("select row_to_json(d) from public.expense_drafts d"), before);
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "f");
  assert.equal(
    f.db.sql(
      `select covered_through from private.nest_recurring_execution where rule_id='${id(800)}'`,
    ),
    "2026-02-01",
  );
  assert.equal(
    f.db.sql(`select count(*) from public.nest_recurring_revisions where rule_id='${id(800)}'`),
    "1",
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  const recovery = f.record(f.recovery());
  assert.equal(Schema.is(LegacyAdoptionRecovery)(recovery), true);
  assert.deepEqual(f.record(f.recovery(850, true)), recovery);
  assert.throws(
    () =>
      f.record(f.command({ ...value, configuration: { ...value.configuration, note: "changed" } })),
    /operation changed/,
  );
  assert.throws(() => f.record(f.command(value, 851)), /changed/);
  assert.throws(
    () => f.db.sql("update public.recurring_expense_rules set active=true"),
    /Legacy rule adopted/,
  );
});
test("pending, changed, linked-inconsistent and colliding sources cannot become mandates", (t) => {
  const f = fixture(t),
    original = f.input();
  f.draft(900, "pending", "2026-01-31");
  assert.throws(() => f.record(f.command(original)), /changed/);
  assert.throws(() => f.record(f.command()), /reconciliation/);
  f.db.sql("update public.expense_drafts set status='posted'");
  assert.throws(() => f.record(f.command()), /reconciliation/);
  f.post(900);
  const ready = f.input();
  f.db.sql("update public.expense_drafts set description='Changed raw history'");
  assert.throws(() => f.record(f.command(ready)), /changed/);
  const collision = {
    ruleId: id(800),
    expectedRevision: null,
    configuration: ready.configuration,
    firstDueOn: f.today,
  };
  f.record(`select public.nest_save_recurring('${id(10)}','${id(860)}',${json(collision)})`);
  assert.throws(() => f.record(f.command()), /reconciliation/);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
});
test("cancelled Save fences delayed requests and private recovery cannot reveal another member's receipt", (t) => {
  const f = fixture(t),
    value = f.input();
  assert.equal(f.record(f.recovery()).status, "unresolved");
  assert.equal(f.record(f.recovery(850, true)).status, "cancelled");
  assert.throws(() => f.record(f.command(value)), /abandoned/);
  const receipt = f.record(f.command(value, 851));
  assert.equal(f.record(f.recovery(851), 2).status, "unresolved");
  assert.equal(receipt.actorId, id(1));
  assert.throws(() => f.record(f.recovery(851), 3), /Not authorized/);
  assert.throws(() => f.record(f.command(value, 852), 3), /Not authorized/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; ${f.command(value, 852)}`),
      /permission denied/,
    );
});
test("prospective start and non-overlapping first cycle are enforced across cadence changes", (t) => {
  const f = fixture(t);
  f.draft(900, "dismissed", "9998-12-31");
  const value = f.input();
  assert.throws(() => f.record(f.command(value)), /First adoption cycle changed/);
  const next = JSON.parse(
    f.db.sql(
      `select private.nest_recurring_cycle(${json(value.configuration.schedule)},'${f.today}','${f.context().coveredThrough}')`,
    ),
  );
  const receipt = f.record(f.command({ ...value, firstDueOn: next.dueOn }));
  assert.equal(receipt.input.firstDueOn, next.dueOn);
  assert.equal(
    f.db.sql(`select next_due_on from private.nest_recurring_execution where rule_id='${id(800)}'`),
    next.dueOn,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

test("adoption approval, source deactivation, mandate and mapping roll back as one transaction", async (t) => {
  const { approve } = await import("./recurring-mandate-fixture.mjs");
  const f = fixture(t),
    value = f.input(),
    approval = approve(f.db, 850, value, "recurring.adopt-legacy");
  for (const table of [
    "public.nest_recurring_revisions",
    "private.nest_legacy_recurring_adoptions",
    "private.nest_legacy_adoption_operations",
  ]) {
    f.db.sql(`alter table ${table} add constraint injected_failure check(false) not valid`);
    assert.throws(() => f.record(f.command(value, 850, approval)), /injected_failure/);
    assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
    assert.equal(
      f.db.sql(`select count(*) from public.nest_recurring_rules where id='${id(800)}'`),
      "0",
    );
    assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
    assert.equal(
      f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
      "approved",
    );
    f.db.sql(`alter table ${table} drop constraint injected_failure`);
  }
  assert.throws(() => f.record(f.command(value, 851, approval)));
  assert.throws(() => f.record(f.command(value, 850, approval), 2));
  assert.throws(() =>
    f.record(
      f.command(
        { ...value, configuration: { ...value.configuration, note: "Substitution" } },
        850,
        approval,
      ),
    ),
  );
  assert.throws(
    () =>
      f.record(
        `select public.nest_execute_legacy_adoption('${id(10)}','${id(850)}',${json(value)},null)`,
      ),
    /approval required/,
  );
  const receipt = f.record(f.command(value, 850, approval));
  assert.equal(receipt.approvalId, approval);
  assert.deepEqual(f.record(f.command(value, 850, approval)), receipt);
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approval}'`),
    "consumed",
  );
  assert.throws(() => f.record(f.recovery()), /Not a direct Save/);
});
test("Save and abandonment race has one truthful terminal outcome", async (t) => {
  const f = fixture(t),
    value = f.input();
  await Promise.allSettled([
    f.db.concurrent(as(1, f.command(value))),
    f.db.concurrent(as(1, f.recovery(850, true))),
  ]);
  const result = f.record(f.recovery());
  assert.ok(["recorded", "cancelled"].includes(result.status));
  assert.equal(
    f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"),
    result.status === "recorded" ? "1" : "0",
  );
  if (result.status === "recorded") assert.deepEqual(f.record(f.command(value)), result.receipt);
  else assert.throws(() => f.record(f.command(value)), /abandoned/);
});
test("invalid financial configuration and past start cannot opt in even an inactive legacy rule", (t) => {
  const f = fixture(t);
  f.db.sql("update public.recurring_expense_rules set active=false");
  const value = f.input();
  for (const patch of [
    { startDate: "2020-01-01" },
    { payerId: id(3) },
    { amountCentimes: "-1" },
    { categoryId: id(999) },
  ])
    assert.throws(() =>
      f.record(f.command({ ...value, configuration: { ...value.configuration, ...patch } })),
    );
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.equal(f.record(f.command(value)).status, "active");
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "f");
});
