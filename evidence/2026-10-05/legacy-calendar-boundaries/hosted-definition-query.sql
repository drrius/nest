select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
p.prosecdef as "securityDefiner",p.proconfig as config,
has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
('claim_calendar_sync','release_calendar_sync','reconcile_calendar_snapshot',
'record_calendar_push','disconnect_calendar','require_calendar_lease')
order by p.proname;
