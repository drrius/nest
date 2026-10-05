select jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,
'securityDefiner',p.prosecdef,'returnType',p.prorettype::regtype::text,'config',p.proconfig,
'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),
'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex')) order by n.nspname,p.oid::regprocedure::text) as functions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname not like 'nest\_%' escape '\'
and (n.nspname='private' or not p.prosecdef
or (not has_function_privilege('authenticated',p.oid,'EXECUTE') and has_function_privilege('service_role',p.oid,'EXECUTE')));
