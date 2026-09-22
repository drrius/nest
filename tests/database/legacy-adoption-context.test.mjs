import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as, json } from "./legacy-adoption-context-fixture.mjs";
import { LegacyAdoptionContext } from "../../packages/contracts/src/legacy-adoption.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");

test("adoption review retains source identity, pending/reconciliation blockers and full source fingerprints", (t) => {
  const f = fixture(t);
  const empty = f.context();
  assert.equal(Schema.is(LegacyAdoptionContext)(empty), true);
  assert.equal(empty.rule.ruleId, id(800));
  assert.deepEqual(empty.blockers, []);
  assert.equal(empty.coveredThrough, null);
  assert.deepEqual(f.context(2), empty);
  f.draft(900, "pending", "2026-01-31");
  const pending = f.context();
  assert.notEqual(pending.reviewToken, empty.reviewToken);
  assert.deepEqual(pending.blockers, ["pending_drafts"]);
  assert.equal(pending.coveredThrough, "2026-02-01");
  f.db.sql("update public.expense_drafts set description='Changed without a timestamp bump'");
  const changed = f.context();
  assert.notEqual(changed.reviewToken, pending.reviewToken);
  f.db.sql("update public.expense_drafts set description='Retained original draft'");
  assert.equal(f.context().reviewToken, pending.reviewToken);
  f.db.sql("update public.expense_drafts set status='posted'");
  assert.deepEqual(f.context().blockers, ["unreconciled_history"]);
  f.post(900);
  const posted = f.context();
  assert.equal(Schema.is(LegacyAdoptionContext)(posted), true);
  assert.deepEqual(posted.blockers, []);
  f.db.sql("update public.expense_drafts set status='dismissed'");
  assert.deepEqual(f.context().blockers, ["unreconciled_history"]);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});

test("coverage keeps entire retained periods including dismissed future drafts and later recorded dates", (t) => {
  const f = fixture(t);
  f.draft(900, "dismissed", "2026-02-02");
  assert.equal(f.context().coveredThrough, "2026-02-28");
  f.db.sql(
    "update public.recurring_expense_rules set schedule_kind='weekly',day_of_month=null,iso_weekday=1",
  );
  assert.equal(f.context().coveredThrough, "2026-02-28");
  f.db.sql("update public.expense_drafts set status='posted'");
  f.db
    .sql(`select private.post_financial_event('${id(10)}','${id(1)}','expense','${id(1)}','Reviewed date',101,
    ${json([
      { memberId: id(1), allocatedCents: 51 },
      { memberId: id(2), allocatedCents: 50 },
    ])},
    '2026-03-04',null,null,null,null,null,'${id(900)}',null)`);
  assert.equal(f.context().coveredThrough, "2026-03-31");
  assert.deepEqual(f.context().blockers, []);
});

test("unsupported original dates and out-of-range cycle ends block adoption without hiding the source", (t) => {
  const f = fixture(t);
  f.draft(900, "dismissed", "infinity");
  for (const day of ["infinity", "-infinity", "10000-01-01", "0001-01-01 BC"]) {
    f.db.sql(`update public.expense_drafts set occurred_on='${day}'`);
    const value = f.context();
    assert.equal(Schema.is(LegacyAdoptionContext)(value), true);
    assert.deepEqual(value.blockers, ["unsupported_history_dates"]);
    assert.equal(value.coveredThrough, null);
    assert.equal(value.rule.drafts.latestDraftOn.kind, "unsupported");
  }
  f.db.sql(
    "update public.recurring_expense_rules set schedule_kind='weekly',day_of_month=null,iso_weekday=1; update public.expense_drafts set occurred_on='9999-12-31'",
  );
  assert.deepEqual(f.context().blockers, ["unsupported_history_dates"]);
});

test("identity collision and an existing mapping are distinguished and API access is household scoped", (t) => {
  const f = fixture(t);
  const base = f.context();
  const configuration = JSON.parse(
    f.db.sql(`select configuration from public.nest_recurring_rules where id='${id(300)}'`),
  );
  f.record(
    `select public.nest_save_recurring('${id(10)}','${id(801)}',${json({ ruleId: id(800), expectedRevision: null, configuration, firstDueOn: f.today })})`,
  );
  assert.deepEqual(f.context().blockers, ["native_identity_in_use"]);
  assert.notEqual(f.context().reviewToken, base.reviewToken);
  f.db.sql(`begin; update public.recurring_expense_rules set active=false;
    insert into private.nest_legacy_recurring_adoptions(household_id,legacy_rule_id,native_rule_id,source_review_token,authorized_by)
    values('${id(10)}','${id(800)}','${id(800)}','${base.reviewToken}','${id(1)}'); commit`);
  const adopted = f.context();
  assert.equal(Schema.is(LegacyAdoptionContext)(adopted), true);
  assert.deepEqual(adopted.blockers, ["already_adopted"]);
  assert.equal(adopted.adoption.nativeRuleId, id(800));
  assert.equal(adopted.adoption.authorizedBy, id(1));
  assert.throws(() => f.record(f.query(), 3), /Not authorized/);
  assert.throws(() => f.record(f.query(800, 20)), /Not authorized|unavailable/);
  assert.throws(() => f.record(f.query(999)), /unavailable/);
  for (const role of ["anon", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.query()}`), /permission denied/);
  assert.throws(
    () =>
      f.db.sql(
        as(
          1,
          "select private.nest_legacy_adoption_review(r) from public.recurring_expense_rules r",
        ),
      ),
    /permission denied/,
  );
});

test("review tokens normalize timezone, bind all raw rule fields and reject contradictory transport summaries", (t) => {
  const f = fixture(t);
  f.draft(900, "dismissed", "2026-01-31");
  const before = f.context();
  const otherZone = JSON.parse(f.db.sql(as(1, `set timezone='America/Los_Angeles'; ${f.query()}`)));
  assert.equal(otherZone.reviewToken, before.reviewToken);
  f.db.sql("update public.recurring_expense_rules set active=false");
  assert.notEqual(f.context().reviewToken, before.reviewToken);
  for (const value of [
    { ...before, blockers: ["pending_drafts"] },
    { ...before, blockers: ["already_adopted"] },
    { ...before, blockers: ["unsupported_history_dates"] },
    { ...before, blockers: ["unreconciled_history", "unreconciled_history"] },
    {
      ...before,
      adoption: {
        nativeRuleId: id(999),
        authorizedBy: id(1),
        authorizedAt: "2026-01-01T00:00:00Z",
      },
    },
  ])
    assert.equal(Schema.is(LegacyAdoptionContext)(value), false);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
