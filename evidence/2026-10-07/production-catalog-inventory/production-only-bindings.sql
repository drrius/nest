begin isolation level repeatable read read only;
set local search_path=pg_catalog;
select jsonb_build_object('readOnly',current_setting('transaction_read_only')='on',
 'functions',(select jsonb_agg(jsonb_build_object(
 'signature',p.oid::regprocedure::text,
 'returnType',p.prorettype::regtype::text,
 'triggerBindings',(select coalesce(jsonb_agg(jsonb_build_object(
  'schema',rn.nspname,'relation',c.relname,'trigger',t.tgname,'enabled',t.tgenabled
 ) order by rn.nspname,c.relname,t.tgname),'[]'::jsonb)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace rn on rn.oid=c.relnamespace where t.tgfoid=p.oid),
 'eventTriggerBindings',(select coalesce(jsonb_agg(jsonb_build_object(
  'name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled
 ) order by e.evtname),'[]'::jsonb) from pg_event_trigger e where e.evtfoid=p.oid)
 ) order by p.oid::regprocedure::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('payroll_is_member','payroll_payslip_guard','payroll_payslip_supersede','payroll_restore','rls_auto_enable'))
) as observation;
rollback;
