select n.nspname as schema,p.proname as name,p.oid::regprocedure::text as signature,
encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex') as "bodySha256",
p.prosecdef as "securityDefiner",p.proconfig as config,
has_function_privilege('anon',p.oid,'EXECUTE') as "anonymousExecute",
has_function_privilege('authenticated',p.oid,'EXECUTE') as "authenticatedExecute"
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in
('establish_opening_balance','post_contextual_expense','assign_expense_context',
'read_household_cost_context','require_money_actor','post_financial_event','get_money_command_result',
'store_money_command_result','validate_money_allocations','other_household_member','revise_expense_context_link')
order by p.proname;
