with audited as (
  select p.oid::regprocedure::text as signature,p.proowner,p.prosecdef
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and (n.nspname,p.proname) in (
    ('public','run_deliver_due_reminders'),('public','run_retain_activity_events'),
    ('public','run_retain_purchased_groceries'),('public','run_ensure_due_occurrences'),
    ('public','run_deliver_member_digests'),('public','run_generate_recurring_drafts_cron'),
    ('public','run_drain_push_outbox'),('private','invoke_push_dispatch')
  )
), owners as (select distinct proowner from audited)
select pg_catalog.jsonb_build_object(
  'observedAt',pg_catalog.statement_timestamp(),
  'queryRole',current_user,
  'transactionReadOnly',pg_catalog.current_setting('transaction_read_only')='on',
  'functions',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature',signature,'owner',pg_catalog.pg_get_userbyid(proowner),'securityDefiner',prosecdef
  ) order by signature) from audited),
  'owners',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',r.rolname,'superuser',r.rolsuper,'bypassRLS',r.rolbypassrls,
    'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDatabase',r.rolcreatedb,
    'replication',r.rolreplication
  ) order by r.rolname) from owners o join pg_catalog.pg_roles r on r.oid=o.proowner),
  'schemaPrivileges',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'owner',pg_catalog.pg_get_userbyid(o.proowner),'schema',n.nspname,
    'usage',pg_catalog.has_schema_privilege(o.proowner,n.oid,'USAGE'),
    'create',pg_catalog.has_schema_privilege(o.proowner,n.oid,'CREATE')
  ) order by o.proowner,n.nspname) from owners o cross join pg_catalog.pg_namespace n
    where n.nspname in ('public','private','auth','storage'))
) as observation;
