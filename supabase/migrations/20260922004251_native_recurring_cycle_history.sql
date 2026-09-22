-- GATED: shared cycle history omits private approval and operation identifiers.
revoke select on public.nest_recurring_cycles from authenticated;
grant select(household_id,rule_id,cycle_key,due_on,starts_on,through_date,revision,event_id,created_at)
  on public.nest_recurring_cycles to authenticated;
create function private.nest_read_recurring_cycles(p_household uuid,p_rule uuid,p_before text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before date; v_rows jsonb; v_next text;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.nest_recurring_rules where household_id=p_household and id=p_rule) then
    raise exception 'Recurring rule unavailable' using errcode='P0002'; end if;
  if p_before is not null then
    v_before:=p_before::date;
    if not isfinite(v_before) or to_char(v_before,'YYYY-MM-DD')<>p_before
      or v_before<date '0001-01-01' or v_before>date '9999-12-31' then
      raise exception 'Invalid cycle cursor' using errcode='22023'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision',c.revision,'source',c.result->'source','eventId',c.event_id,
    'recordedBy',coalesce(c.result->'authorizedBy',c.result->'actorId'),
    'recordedAt',to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'cycle',c.result->'cycle','configuration',c.result->'configuration',
    'amountCentimes',e.amount_cents::text,'payerId',e.payer_member_id
  ) order by c.due_on desc),'[]'::jsonb) into v_rows
  from (select * from public.nest_recurring_cycles where household_id=p_household and rule_id=p_rule
    and (v_before is null or due_on<v_before) order by due_on desc limit 21) c
  join public.financial_events e on e.id=c.event_id and e.household_id=p_household;
  if jsonb_array_length(v_rows)>20 then
    v_rows:=v_rows-20; v_next:=v_rows->19->'cycle'->>'dueOn';
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'ruleId',p_rule,
    'before',p_before,'next',v_next,'cycles',v_rows);
end;
$$;
revoke all on function private.nest_read_recurring_cycles(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.nest_read_recurring_cycles(uuid,uuid,text) to authenticated;
create function public.nest_read_recurring_cycles(p_household uuid,p_rule uuid,p_before text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_recurring_cycles($1,$2,$3); $$;
revoke all on function public.nest_read_recurring_cycles(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nest_read_recurring_cycles(uuid,uuid,text) to authenticated;
