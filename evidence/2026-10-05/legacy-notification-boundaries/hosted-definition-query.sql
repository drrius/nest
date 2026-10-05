select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
p.prosecdef as "securityDefiner",p.proconfig as config,
has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('register_push_subscription','unregister_push_subscription','enqueue_self_device_push_test',
'read_self_device_push_test','mark_inbox_notifications_read','upsert_digest_preference','pause_my_push_for_signout')
order by p.proname;
