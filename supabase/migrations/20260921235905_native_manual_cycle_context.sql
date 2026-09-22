-- GATED read-only private approval context. No financial writer or scheduler permission.
create function private.nest_read_manual_cycle_context(p_household uuid,p_approval uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a jsonb; i jsonb;
begin
  a:=private.nest_read_manual_cycle_approval(p_household,p_approval);
  i:=a->'approval'->'input';
  return jsonb_build_object('version',1,'actorId',auth.uid(),'householdId',p_household,
    'approvalId',p_approval,'input',i,
    'target',private.nest_read_recurring_rule(p_household,(i->>'ruleId')::uuid),
    'detail',private.nest_money_detail(p_household,(i->>'sourceEventId')::uuid),
    'linked',exists(select 1 from public.nest_recurring_cycles
      where household_id=p_household and event_id=(i->>'sourceEventId')::uuid));
end;
$$;
revoke all on function private.nest_read_manual_cycle_context(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_manual_cycle_context(uuid,uuid) to authenticated;
create function public.nest_read_manual_cycle_context(p_household uuid,p_approval uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_read_manual_cycle_context($1,$2);
$$;
revoke all on function public.nest_read_manual_cycle_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_manual_cycle_context(uuid,uuid) to authenticated;
