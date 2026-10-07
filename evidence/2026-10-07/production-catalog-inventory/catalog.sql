begin isolation level repeatable read read only;
set local search_path=pg_catalog;
select jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'database',current_database(),'role',current_user,
 'serverVersion',current_setting('server_version'),
 'publicRelations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v')),
 'nativeRelations',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') and c.relname like 'nest\_%' escape '\'),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'schema',n.nspname,
  'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
  'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
  'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
  'serviceRoleExecute',has_function_privilege('service_role',p.oid,'EXECUTE')
 ) order by n.nspname,p.oid::regprocedure::text),'[]'::jsonb)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prokind in ('f','p')),
 'cronExtension',(select extversion from pg_extension where extname='pg_cron'),
 'cronCatalogPresent',to_regclass('cron.job') is not null
) as observation;
rollback;
