import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { captureScheduledWriterInventory } from "../../tools/migration/scheduled-writer-inventory.mjs";

function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  return db;
}

function createCatalog(db) {
  db.sql(`create schema cron;
    create table cron.job(jobid bigint primary key,jobname text,schedule text,
      command text,database text,username text,active boolean);
    insert into cron.job values
      (1,'household-os-deliver-due-reminders','* * * * *',
        'select public.run_deliver_due_reminders()','postgres','postgres',true),
      (2,'unknown-external-dispatch','0 0 * * *',
        'select net.http_post(headers := ''Bearer fixture-secret'')','postgres','other',false);`);
}

test("missing scheduler is unknown and known function bodies stay server-side", (t) => {
  const db = fixture(t);
  db.sql(`create function public.run_deliver_due_reminders() returns text
    language sql as $$select 'private-fixture-function-secret'::text$$`);
  const definition = db.sql(
    "select pg_get_functiondef('public.run_deliver_due_reminders()'::regprocedure)",
  );
  const result = captureScheduledWriterInventory(db);
  assert.equal(result.metadata.readOnly, true);
  assert.equal(result.metadata.extensionPresent, false);
  assert.equal(result.metadata.catalogPresent, false);
  assert.equal(result.jobs, null);
  assert.equal(result.catalogSnapshotComplete, false);
  assert.equal(result.cutoverVerified, false);
  assert.equal(result.drainageVerified, false);
  assert.equal(result.externalInvokersVerified, false);
  assert.equal(
    result.auditedFunctionDefinitions[0].signature,
    "public.run_deliver_due_reminders()",
  );
  assert.equal(
    result.auditedFunctionDefinitions[0].definitionSha256,
    createHash("sha256").update(`${definition}\n`).digest("hex"),
  );
  assert.doesNotMatch(JSON.stringify(result), /private-fixture-function-secret/);
  assert.equal(
    db.sql("select pg_get_functiondef('public.run_deliver_due_reminders()'::regprocedure)"),
    definition,
  );
});

test("catalog fixture retains unknown and inactive jobs without exporting commands or changing rows", (t) => {
  const db = fixture(t);
  createCatalog(db);
  const before = db.sql("select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j");
  const result = captureScheduledWriterInventory(db);
  assert.equal(result.metadata.catalogPresent, true);
  assert.equal(result.metadata.allRowsVisible, true);
  assert.equal(result.metadata.catalogOwnedByExtension, false);
  assert.equal(result.catalogSnapshotComplete, false);
  assert.equal(result.jobs.count, 2);
  assert.deepEqual(result.jobs.rows[1], {
    id: 2,
    name: "unknown-external-dispatch",
    active: false,
    database: "postgres",
    role: "other",
    schedule: "0 0 * * *",
    commandSha256: createHash("sha256")
      .update("select net.http_post(headers := 'Bearer fixture-secret')")
      .digest("hex"),
  });
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|net\.http_post|"command"/);
  assert.equal(db.sql("select jsonb_agg(to_jsonb(j) order by jobid) from cron.job j"), before);
});

test("RLS-filtered job access refuses a misleading partial inventory", (t) => {
  const db = fixture(t);
  createCatalog(db);
  db.sql(`create role other; grant usage on schema cron to other;
    grant select on cron.job to other; alter table cron.job enable row level security;
    create policy own_jobs on cron.job using(username=current_user);`);
  assert.equal(db.sql("set role other; select count(*) from cron.job"), "1");
  const result = captureScheduledWriterInventory({
    sql: (query) => db.sql(`set role other; ${query}`),
  });
  assert.equal(result.metadata.catalogReadable, true);
  assert.equal(result.metadata.allRowsVisible, false);
  assert.equal(result.jobs, null);
  assert.equal(result.catalogSnapshotComplete, false);
});

test("missing SELECT privilege or unsupported catalog shape cannot mean zero jobs", (t) => {
  const db = fixture(t);
  createCatalog(db);
  db.sql("create role restricted; grant usage on schema cron to restricted");
  const restricted = captureScheduledWriterInventory({
    sql: (query) => db.sql(`set role restricted; ${query}`),
  });
  assert.equal(restricted.metadata.catalogReadable, false);
  assert.equal(restricted.jobs, null);
  db.sql("alter table cron.job drop column active");
  const unsupported = captureScheduledWriterInventory(db);
  assert.equal(unsupported.metadata.catalogShapeSupported, false);
  assert.equal(unsupported.jobs, null);
  assert.equal(unsupported.catalogSnapshotComplete, false);
});

test("large catalogs report truncation instead of claiming a complete inventory", (t) => {
  const db = fixture(t);
  createCatalog(db);
  db.sql(`insert into cron.job select i,'job-'||i,'0 0 * * *','select 1',
    'postgres','postgres',true from generate_series(3,1001) i`);
  const result = captureScheduledWriterInventory(db);
  assert.equal(result.jobs.count, 1001);
  assert.equal(result.jobs.rows.length, 1000);
  assert.equal(result.jobs.rows[999].id, 1000);
  assert.equal(result.catalogSnapshotComplete, false);
});

test("an already writable transaction is refused and never committed", (t) => {
  const db = fixture(t);
  assert.throws(
    () =>
      captureScheduledWriterInventory({
        sql: (query) => db.sql(`begin; create table public.must_not_commit(id int); ${query}`),
      }),
    /SET TRANSACTION ISOLATION LEVEL must be called before any query/,
  );
  assert.equal(db.sql("select to_regclass('public.must_not_commit') is null"), "t");
});
