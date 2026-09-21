-- GATED: native recurring configuration/execution snapshots; no writes or legacy adoption.
create function private.nest_recurring_document(p_rule public.nest_recurring_rules,p_execution private.nest_recurring_execution)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
  if p_execution.rule_id is null or p_execution.rule_id<>p_rule.id or p_execution.household_id<>p_rule.household_id then
    raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  return jsonb_build_object('ruleId',p_rule.id,'revision',p_rule.revision,'configuration',p_rule.configuration,
    'status',p_rule.status,'authorizedBy',p_rule.authorized_by,
    'authorizedAt',to_char(p_rule.authorized_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'coveredThrough',to_char(p_execution.covered_through,'YYYY-MM-DD'),
    'nextDueOn',to_char(p_execution.next_due_on,'YYYY-MM-DD'));
end;
$$;
revoke all on function private.nest_recurring_document(public.nest_recurring_rules,private.nest_recurring_execution) from public,anon,authenticated;

create function private.nest_read_recurring_rules(p_household uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.nest_recurring_document(r,e) order by r.id),'[]'::jsonb)
    into v_rows from (select * from public.nest_recurring_rules where household_id=p_household
      and (p_after is null or id>p_after) order by id limit 51) r
    left join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id;
  if jsonb_array_length(v_rows)>50 then
    v_rows:=v_rows-50; v_next:=(v_rows->49->>'ruleId')::uuid;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,
    'today',to_char(clock_timestamp() at time zone 'Europe/Zurich','YYYY-MM-DD'),
    'after',p_after,'next',v_next,'rules',v_rows);
end;
$$;
revoke all on function private.nest_read_recurring_rules(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_recurring_rules(uuid,uuid) to authenticated;
create function public.nest_read_recurring_rules(p_household uuid,p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_read_recurring_rules($1,$2);
$$;
revoke all on function public.nest_read_recurring_rules(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_recurring_rules(uuid,uuid) to authenticated;

create function private.nest_read_recurring_rule(p_household uuid,p_rule uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_document jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_rule is null then raise exception 'Invalid recurring rule' using errcode='22023'; end if;
  select private.nest_recurring_document(r,e) into v_document from public.nest_recurring_rules r
    left join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id
    where r.household_id=p_household and r.id=p_rule;
  if not found then raise exception 'Recurring rule unavailable' using errcode='P0002'; end if;
  return jsonb_build_object('version',1,'householdId',p_household,
    'today',to_char(clock_timestamp() at time zone 'Europe/Zurich','YYYY-MM-DD'),'rule',v_document);
end;
$$;
revoke all on function private.nest_read_recurring_rule(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_recurring_rule(uuid,uuid) to authenticated;
create function public.nest_read_recurring_rule(p_household uuid,p_rule uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_read_recurring_rule($1,$2);
$$;
revoke all on function public.nest_read_recurring_rule(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_recurring_rule(uuid,uuid) to authenticated;
