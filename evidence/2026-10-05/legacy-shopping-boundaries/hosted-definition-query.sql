select p.proname as name,p.oid::regprocedure::text as signature,
 encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
 p.prosecdef as "securityDefiner",p.proconfig as config,
 has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
 has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('start_shopping_session','claim_grocery_item',
 'release_grocery_item','remove_grocery_item','merge_grocery_items',
 'cancel_shopping_session','finish_shopping_session') order by p.proname;

select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
 encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
 p.prosecdef as "securityDefiner",p.proconfig as config,
 has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
 has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.oid in ('private.is_household_member(uuid)'::regprocedure,
 'private.get_meal_grocery_command_result(uuid,text,text,jsonb)'::regprocedure) order by p.proname;
