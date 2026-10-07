select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as body_sha256,
p.prosecdef as security_definer,p.proconfig as config,
has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute,
has_schema_privilege('anon',n.oid,'USAGE') as anonymous_schema_usage
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private' and p.proname in ('guard_calendar_connection','guard_calendar_event_sync')
order by p.proname;
