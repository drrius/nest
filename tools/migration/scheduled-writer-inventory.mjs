const readiness = `with catalog as (
  select c.oid,c.relkind,n.oid as schema_oid
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='cron' and c.relname='job'
), extension as (select oid,extversion from pg_extension where extname='pg_cron')
select jsonb_build_object(
  'database',current_database(),'role',current_user,
  'readOnly',current_setting('transaction_read_only')='on',
  'extensionPresent',exists(select from extension),
  'extensionVersion',(select extversion from extension),
  'catalogPresent',exists(select from catalog),
  'catalogOwnedByExtension',exists(select from catalog c join pg_depend d
    on d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
    join extension e on d.refclassid='pg_extension'::regclass and d.refobjid=e.oid),
  'catalogShapeSupported',coalesce((select relkind='r' and
    (select count(*)=7 from pg_attribute a where a.attrelid=c.oid
      and a.attnum>0 and not a.attisdropped and
      (a.attname,a.atttypid) in (('jobid','int8'::regtype),('jobname','text'::regtype),
      ('schedule','text'::regtype),('command','text'::regtype),
      ('database','text'::regtype),('username','text'::regtype),('active','bool'::regtype)))
    from catalog c),false),
  'catalogReadable',coalesce((select has_schema_privilege(schema_oid,'USAGE')
    and has_table_privilege(oid,'SELECT') from catalog),false),
  'allRowsVisible',coalesce((select not row_security_active(oid) from catalog),false)
) as metadata`;

const jobs = `(select jsonb_build_object(
  'count',(select count(*) from cron.job),
  'rows',coalesce(jsonb_agg(jsonb_build_object(
    'id',jobid,'name',jobname,'active',active,'database',database,
    'role',username,'schedule',schedule,
    'commandSha256',encode(sha256(convert_to(command,'UTF8')),'hex')
  ) order by jobid),'[]'::jsonb))
  from (select jobid,jobname,active,database,username,schedule,command
    from cron.job order by jobid limit 1000) j)`;

const functions = `(select coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'securityDefiner',p.prosecdef,
  'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
) order by p.oid::regprocedure::text),'[]'::jsonb)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind in ('f','p') and (n.nspname,p.proname) in (
  ('public','run_deliver_due_reminders'),('public','run_retain_activity_events'),
  ('public','run_retain_purchased_groceries'),('public','run_ensure_due_occurrences'),
  ('public','run_deliver_member_digests'),('public','run_generate_recurring_drafts_cron'),
  ('public','run_drain_push_outbox'),('private','invoke_push_dispatch')
))`;

function read(db, query) {
  const result = JSON.parse(
    db.sql(`begin isolation level repeatable read read only;
    set local search_path=pg_catalog;
    ${query}; rollback;`),
  );
  if (!(result.metadata ?? result).readOnly)
    throw new Error("Inventory requires an isolated read-only database session");
  return result;
}

// db.sql must use a fresh session per call, as the disposable schema runner does.
export function captureScheduledWriterInventory(db) {
  const probe = read(db, readiness);
  const canReadJobs = probe.catalogShapeSupported && probe.catalogReadable && probe.allRowsVisible;
  const result = read(
    db,
    `select jsonb_build_object(
    'metadata',metadata,'jobs',${canReadJobs ? jobs : "null::jsonb"},
    'auditedFunctionDefinitions',${functions}) from (${readiness}) observation`,
  );
  const metadata = result.metadata;
  const snapshotComplete =
    canReadJobs &&
    metadata.extensionPresent &&
    metadata.catalogOwnedByExtension &&
    metadata.catalogShapeSupported &&
    metadata.catalogReadable &&
    metadata.allRowsVisible &&
    result.jobs.count <= 1000;
  return {
    ...result,
    catalogSnapshotComplete: snapshotComplete,
    externalInvokersVerified: false,
    drainageVerified: false,
    cutoverVerified: false,
  };
}
