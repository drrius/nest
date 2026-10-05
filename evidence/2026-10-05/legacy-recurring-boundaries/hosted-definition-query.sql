select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
p.prosecdef as "securityDefiner",p.proconfig as config,
has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
('create_recurring_expense_rule','update_recurring_expense_rule','set_recurring_expense_rule_active',
'generate_due_recurring_drafts','confirm_expense_draft','dismiss_expense_draft','nest_assert_legacy_rule_open',
'nest_guard_legacy_recurring_write','nest_guard_legacy_draft_write','advance_recurring_expense_version')
order by p.proname,p.oid::regprocedure::text;
