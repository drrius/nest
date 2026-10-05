begin;
create temporary table nest_invoker_probe_owners as
select user_id,household_id,row_number() over(order by user_id) as ordinal
from public.household_members
where household_id=(select m.household_id from public.household_members m group by m.household_id having count(*)=2
order by (select count(*) from public.financial_events f where f.household_id=m.household_id) desc,m.household_id limit 1);
do $$ begin if (select count(*) from nest_invoker_probe_owners)<>2 then
raise exception 'Expected the authorized two-member test household';end if;end $$;
insert into public.household_commitments(id,household_id,created_by,title,status,renewal_on,notice_days)
select x.id,m.household_id,m.user_id,x.title,'active',x.renewal_on,x.notice_days
from nest_invoker_probe_owners m cross join (values
('00000000-0000-4000-8000-000000011050'::uuid,'Boundary hosted dates 20261005 underflow',date '4713-01-01 BC',730),
('00000000-0000-4000-8000-000000011051'::uuid,'Boundary hosted dates 20261005 due',date '2026-10-10',5),
('00000000-0000-4000-8000-000000011052'::uuid,'Boundary hosted dates 20261005 overdue',date '2026-09-01',0)
) x(id,title,renewal_on,notice_days) where m.ordinal=1;
create temporary table nest_invoker_probe_results(actor text,body jsonb);
grant insert,select on nest_invoker_probe_results to authenticated;
do $$ declare m record;v_result jsonb;begin
for m in select user_id,'member-'||ordinal as label from nest_invoker_probe_owners order by ordinal loop
execute 'set local role authenticated';
perform set_config('request.jwt.claim.sub',m.user_id::text,true);
v_result:=public.list_home_attention_records('commitments','Boundary hosted dates 20261005',0,date '2026-10-05');
insert into nest_invoker_probe_results values(m.label,jsonb_build_object('count',v_result->'count',
'ids',(select jsonb_agg(value->>'id' order by ordinal) from jsonb_array_elements(v_result->'rows') with ordinality e(value,ordinal))));
execute 'reset role';
end loop;
execute 'set local role authenticated';
perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000011099',true);
v_result:=public.list_home_attention_records('commitments','Boundary hosted dates 20261005',0,date '2026-10-05');
insert into nest_invoker_probe_results values('outsider',jsonb_build_object('count',v_result->'count','rows',v_result->'rows'));
execute 'reset role';
end $$;
select jsonb_agg(jsonb_build_object('actor',actor,'result',body) order by actor) as results from nest_invoker_probe_results;
rollback;
