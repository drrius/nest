select jsonb_agg(jsonb_build_object(
'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
'securityDefiner',p.prosecdef,'config',p.proconfig,
'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname) as functions
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
('add_project_task_batch','archive_household_decision_option','choose_household_decision_option',
'convert_household_decision','reorder_household_areas','set_household_decision_status',
'advance_home_record_version','append_household_area','guard_household_record_identity');
