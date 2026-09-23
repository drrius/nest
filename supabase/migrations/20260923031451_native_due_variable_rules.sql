-- GATED read-only discovery. No cycle, approval, expense or mandate is created.
create index nest_recurring_due_variable_members on public.nest_recurring_rules(household_id,id)
  where status='active' and configuration->>'mode'='variable';
create function private.nest_due_variable_document(p_rule public.nest_recurring_rules,p_execution private.nest_recurring_execution)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_document jsonb; v_cycle jsonb;
begin
  v_document:=private.nest_recurring_document(p_rule,p_execution);
  v_cycle:=private.nest_recurring_cycle(p_rule.configuration->'schedule',p_execution.next_due_on,p_execution.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from to_char(p_execution.next_due_on,'YYYY-MM-DD')
    or p_execution.next_due_on<(p_rule.configuration->>'startDate')::date then
    raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  return v_document;
end;
$$;
revoke all on function private.nest_due_variable_document(public.nest_recurring_rules,private.nest_recurring_execution) from public,anon,authenticated,service_role;
create function private.nest_read_due_variable_rules(p_household uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid; v_today date:=(clock_timestamp() at time zone 'Europe/Zurich')::date;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.nest_due_variable_document(r,e) order by r.id),'[]'::jsonb)
    into v_rows from (
      select r.id from public.nest_recurring_rules r left join private.nest_recurring_execution e
        on e.household_id=r.household_id and e.rule_id=r.id
      where r.household_id=p_household and r.status='active' and r.configuration->>'mode'='variable'
        and (p_after is null or r.id>p_after) and (e.rule_id is null or e.next_due_on<=v_today)
      order by r.id limit 51
    ) selected join public.nest_recurring_rules r on r.id=selected.id and r.household_id=p_household
    left join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id;
  if jsonb_array_length(v_rows)>50 then
    v_rows:=v_rows-50; v_next:=(v_rows->49->>'ruleId')::uuid;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'today',to_char(v_today,'YYYY-MM-DD'),
    'after',p_after,'next',v_next,'rules',v_rows);
end;
$$;
revoke all on function private.nest_read_due_variable_rules(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_due_variable_rules(uuid,uuid) to authenticated;
create function public.nest_read_due_variable_rules(p_household uuid,p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_due_variable_rules($1,$2); $$;
revoke all on function public.nest_read_due_variable_rules(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_due_variable_rules(uuid,uuid) to authenticated;
