begin isolation level repeatable read read only;
set local search_path=pg_catalog;
select pg_catalog.jsonb_build_object('observedAt',pg_catalog.statement_timestamp(),'metadata',metadata,'jobs',(select pg_catalog.jsonb_build_object(
  'count',(select count(*) from cron.job),
  'rows',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',jobid,'name',jobname,'active',active,'database',database,
    'role',username,'schedule',schedule,
    'commandSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(command,'UTF8')),'hex')
  ) order by jobid),'[]'::jsonb))
  from (select jobid,jobname,active,database,username,schedule,command
    from cron.job order by jobid limit 1000) j),'auditedFunctionDefinitions',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_catalog.pg_get_userbyid(p.proowner),
  'securityDefiner',p.prosecdef,
  'definitionSha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex')
) order by p.oid::regprocedure::text),'[]'::jsonb)
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where p.prokind in ('f','p') and (n.nspname,p.proname) in (
  ('public','run_deliver_due_reminders'),('public','run_retain_activity_events'),
  ('public','run_retain_purchased_groceries'),('public','run_ensure_due_occurrences'),
  ('public','run_deliver_member_digests'),('public','run_generate_recurring_drafts_cron'),
  ('public','run_drain_push_outbox'),('private','invoke_push_dispatch')
))) from (with catalog as (
  select c.oid,c.relkind,n.oid as schema_oid
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='cron' and c.relname='job'
), extension as (select oid,extversion from pg_catalog.pg_extension where extname='pg_cron')
select pg_catalog.jsonb_build_object(
  'database',pg_catalog.current_database(),'role',current_user,
  'readOnly',pg_catalog.current_setting('transaction_read_only')='on',
  'extensionPresent',exists(select from extension),
  'extensionVersion',(select extversion from extension),
  'catalogPresent',exists(select from catalog),
  'catalogOwnedByExtension',exists(select from catalog c join pg_catalog.pg_depend d
    on d.classid='pg_catalog.pg_class'::regclass and d.objid=c.oid and d.deptype='e'
    join extension e on d.refclassid='pg_catalog.pg_extension'::regclass and d.refobjid=e.oid),
  'catalogShapeSupported',coalesce((select relkind='r' and
    (select count(*)=7 from pg_catalog.pg_attribute a where a.attrelid=c.oid
      and a.attnum>0 and not a.attisdropped and
      (a.attname,a.atttypid) in (('jobid','int8'::regtype),('jobname','text'::regtype),
      ('schedule','text'::regtype),('command','text'::regtype),
      ('database','text'::regtype),('username','text'::regtype),('active','bool'::regtype)))
    from catalog c),false),
  'catalogReadable',coalesce((select pg_catalog.has_schema_privilege(schema_oid,'USAGE')
    and pg_catalog.has_table_privilege(oid,'SELECT') from catalog),false),
  'allRowsVisible',coalesce((select not pg_catalog.row_security_active(oid) from catalog),false)
) as metadata) observation;

rollback;
