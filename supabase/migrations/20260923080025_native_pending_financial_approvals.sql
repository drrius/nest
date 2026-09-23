-- GATED: private read only; no approval decision or financial mutation.
create function public.nest_pending_financial_approvals(p_household uuid,p_after uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_rows jsonb; v_more boolean; v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.household_members
    where household_id=p_household and user_id=v_actor) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  with candidates as materialized (
    select id,command,expires_at from public.nest_action_approvals
    where household_id=p_household and actor_id=v_actor and status='pending'
      and expires_at>statement_timestamp() and (p_after is null or id>p_after)
      and command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
        'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel',
        'recurring.resume','recurring.record-cycle','recurring.link-cycle','recurring.dismiss-legacy-draft',
        'recurring.confirm-legacy-draft','recurring.adopt-legacy')
    order by id limit 21
  ), page as (select * from candidates order by id limit 20)
  select coalesce(jsonb_agg(jsonb_build_object('approvalId',id,'command',command,
    'expiresAt',to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by id),'[]'),
    (select count(*)>20 from candidates) into v_rows,v_more from page;
  return jsonb_build_object('version',1,'householdId',p_household,'actorId',v_actor,'approvals',v_rows,
    'next',case when v_more then v_rows->19->>'approvalId' else null end);
end;
$$;
revoke all on function public.nest_pending_financial_approvals(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_pending_financial_approvals(uuid,uuid) to authenticated;
