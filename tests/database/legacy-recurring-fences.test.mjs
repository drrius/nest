import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, as, json, sleeping } from "./legacy-recurring-fence-fixture.mjs";
test("unadopted rules retain their actual legacy generator and active-state behavior", (t) => {
  const f = fixture(t);
  assert.equal(f.db.sql(f.generate), "1");
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "2");
  assert.equal(
    f.db.sql("select next_occurrence_on from public.recurring_expense_rules"),
    "2026-03-31",
  );
  assert.equal(
    f.record(`select public.set_recurring_expense_rule_active('${id(800)}',false,'legacy-stop')`)
      .active,
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
});
test("mapped source identity is immutable and old writes cannot reactivate, detach, delete or append drafts", (t) => {
  const f = fixture(t);
  f.adopt();
  const before = f.db.sql("select row_to_json(d) from public.expense_drafts d");
  for (const sql of [
    `select public.set_recurring_expense_rule_active('${id(800)}',true,'reactivate')`,
    "update public.recurring_expense_rules set description='Changed'",
    "delete from public.recurring_expense_rules",
    "update public.expense_drafts set status='dismissed'",
    "update public.expense_drafts set recurring_expense_rule_id=null",
    "delete from public.expense_drafts",
  ])
    assert.throws(
      () => f.db.sql(`set request.jwt.claim.sub='${id(1)}'; ${sql}`),
      /Legacy rule adopted/,
    );
  assert.throws(() => f.draft(901, "pending", "2026-02-28"), /Legacy rule adopted/);
  assert.equal(f.db.sql(f.generate), "0");
  assert.equal(f.db.sql("select row_to_json(d) from public.expense_drafts d"), before);
  assert.equal(f.read().rules[0].active, false);
  const updated = f.record(
    `select public.nest_save_recurring('${id(10)}','${id(802)}',${json({ ...f.rule, expectedRevision: f.native.revision, configuration: { ...f.rule.configuration, description: "Native configuration" } })})`,
  );
  assert.notEqual(updated.revision, f.native.revision);
  for (const mutation of [
    "update private.nest_legacy_recurring_adoptions set authorized_at=now()",
    "delete from private.nest_legacy_recurring_adoptions",
  ])
    assert.throws(() => f.db.sql(mutation), /immutable|append.only|cannot/i);
});
test("the actual old confirmation function rolls back its financial posting when source writes are fenced", (t) => {
  const f = fixture(t);
  f.adopt();
  assert.throws(
    () => f.record(`select public.confirm_expense_draft('${id(900)}','late-old-confirmation')`),
    /Legacy rule adopted/,
  );
  for (const table of [
    "financial_events",
    "financial_allocations",
    "ledger_entries",
    "activity_events",
    "inbox_notifications",
    "push_outbox",
    "money_command_receipts",
  ])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("a generator holding the rule row loses a contended fence without deadlocking adoption", async (t) => {
  const f = fixture(t);
  const oldWriter = f.db.concurrent(`set application_name='old-generator-fence'; begin;
    select id from public.recurring_expense_rules where id='${id(800)}' for update;
    select pg_sleep(0.6); ${f.generate}; commit`);
  // Register rejection handling before the competing transaction can reject.
  const oldResult = oldWriter.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
  await sleeping(f.db, "old-generator-fence");
  await f.db.concurrent(`begin; set local lock_timeout='3s'; ${f.adoptSql}; commit`);
  const result = await oldResult;
  assert.equal(result.ok, false);
  assert.match(result.error.stderr, /being reviewed/);
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
});
test("a stale repeatable-read draft writer cannot miss a committed adoption mapping", async (t) => {
  const f = fixture(t);
  const writer = f.db
    .concurrent(`set application_name='old-repeatable-fence'; begin isolation level repeatable read;
    select active from public.recurring_expense_rules where id='${id(800)}';
    select pg_sleep(0.6); update public.expense_drafts set description='Stale writer'; commit`);
  const settled = writer.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
  await sleeping(f.db, "old-repeatable-fence");
  f.adopt();
  const result = await settled;
  assert.equal(result.ok, false);
  assert.match(result.error.stderr, /could not serialize|Legacy rule adopted/);
  assert.equal(
    f.db.sql("select description from public.expense_drafts"),
    "Retained original draft",
  );
});
test("mapping and fencing internals remain unavailable to API roles and respect native identity", (t) => {
  const f = fixture(t);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_legacy_recurring_adoptions`),
      /permission denied/,
    );
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; select private.nest_assert_legacy_rule_open('${id(10)}','${id(800)}')`,
        ),
      /permission denied/,
    );
  }
  assert.throws(
    () =>
      f.db
        .sql(`insert into private.nest_legacy_recurring_adoptions(household_id,legacy_rule_id,native_rule_id,source_review_token,authorized_by)
    values('${id(10)}','${id(800)}','${id(300)}','${"0".repeat(64)}','${id(1)}')`),
    /check constraint/,
  );
  assert.equal(f.db.sql(as(1, "select count(*) from public.nest_recurring_rules")), "2");
});
