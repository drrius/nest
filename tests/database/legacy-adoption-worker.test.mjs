import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, as } from "./legacy-adoption-command-fixture.mjs";
import { sleeping } from "./legacy-recurring-fence-fixture.mjs";

test("adopted fixed rule executes one native cycle while the actual legacy generator stays disabled", (t) => {
  const f = fixture(t),
    input = f.input(),
    receipt = f.record(f.command(input));
  const job = f.job(880, {
    householdId: id(10),
    ruleId: id(800),
    revision: receipt.revision,
    dueOn: input.firstDueOn,
  });
  const first = f.execute(job);
  assert.deepEqual(f.execute(job), first);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  for (const file of ["next-date.sql", "generate-drafts.sql"])
    f.db.file(`tests/database/legacy-recurring/${file}`);
  assert.equal(
    f.db.sql(
      `select private.generate_due_recurring_drafts_for_household('${id(10)}','${id(1)}','${f.today}')`,
    ),
    "0",
  );
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "0");
});

test("actual old generator and adoption command serialize without a partial generator write or deadlock", async (t) => {
  const f = fixture(t),
    input = f.input();
  f.db.sql(
    "alter table public.expense_drafts alter column id set default extensions.gen_random_uuid()",
  );
  for (const file of ["next-date.sql", "generate-drafts.sql"])
    f.db.file(`tests/database/legacy-recurring/${file}`);
  const generator = f.db.concurrent(`set application_name='adoption-generator-race'; begin;
    select id from public.recurring_expense_rules where id='${id(800)}' for update;
    select pg_sleep(0.6);
    select private.generate_due_recurring_drafts_for_household('${id(10)}','${id(1)}','2026-02-28'); commit`);
  const settled = generator.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await sleeping(f.db, "adoption-generator-race");
  const receipt = JSON.parse(
    (await f.db.concurrent(as(1, `set lock_timeout='3s'; ${f.command(input)}`))).stdout,
  );
  assert.equal(receipt.status, "active");
  assert.match((await settled).error.stderr, /being reviewed/);
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
  assert.equal(
    f.db.sql("select next_occurrence_on from public.recurring_expense_rules"),
    "2026-01-31",
  );
});

test("a frozen adoption transaction cannot miss a concurrently inserted pending draft", async (t) => {
  const f = fixture(t),
    input = f.input();
  const adoption = f.db.concurrent(
    as(
      1,
      `set application_name='adoption-repeatable-race'; begin isolation level repeatable read;
    select count(*) from public.nest_recurring_rules; select pg_sleep(0.6); ${f.command(input)}; commit`,
    ),
  );
  const settled = adoption.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await sleeping(f.db, "adoption-repeatable-race");
  f.draft(900, "pending", "2026-01-31");
  assert.match((await settled).error.stderr, /requires READ COMMITTED/);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
  assert.throws(() => f.record(f.command(input)), /changed/);
});
