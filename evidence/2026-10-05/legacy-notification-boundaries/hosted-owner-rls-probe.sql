begin;
create temporary table nest_digest_probe_members as
select household_id,user_id,row_number() over(order by user_id) ordinal
from public.household_members where household_id=(
  select household_id from public.household_members group by household_id having count(*)=2 order by household_id limit 1);
do $guard$ begin
  if (select count(*) from nest_digest_probe_members)<>2
    or exists(select 1 from public.notification_digest_preferences) then
    raise exception 'Temporary digest probe requires two members and an empty retained table'; end if;
end $guard$;
insert into public.notification_digest_preferences(household_id,member_id,enabled,local_time)
select household_id,user_id,false,'08:00' from nest_digest_probe_members;
create temporary table nest_digest_probe_results(member_number bigint,own_visible bigint,other_visible bigint);
grant select on nest_digest_probe_members to authenticated;
grant insert,select on nest_digest_probe_results to authenticated;
set local role authenticated;
do $probe$ declare m record; own_rows bigint; other_rows bigint; begin
  for m in select * from nest_digest_probe_members order by ordinal loop
    perform set_config('request.jwt.claim.sub',m.user_id::text,true);
    select count(*) into own_rows from public.notification_digest_preferences where member_id=auth.uid();
    select count(*) into other_rows from public.notification_digest_preferences where member_id<>auth.uid();
    if own_rows<>1 or other_rows<>0 then raise exception 'Digest owner RLS failed'; end if;
    insert into nest_digest_probe_results values(m.ordinal,own_rows,other_rows);
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009923',true);
  if exists(select 1 from public.notification_digest_preferences) then raise exception 'Digest outsider RLS failed'; end if;
end $probe$;
select jsonb_build_object('members',(select jsonb_agg(to_jsonb(r) order by member_number) from nest_digest_probe_results r),
  'outsiderRows',(select count(*) from public.notification_digest_preferences),'fixtureRowsRolledBack',true) as verification;
rollback;
