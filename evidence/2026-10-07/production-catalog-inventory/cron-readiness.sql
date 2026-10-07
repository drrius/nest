begin isolation level repeatable read read only;
set local search_path=pg_catalog;
with catalog as (
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
) as metadata;

rollback;
