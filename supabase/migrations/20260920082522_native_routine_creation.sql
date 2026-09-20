-- GATED additive candidate. Requires audited legacy routine/date/occurrence helpers.
-- No production application, delivery opt-in or historical row replacement.
create function private.nest_routine_integer(p_value jsonb,p_max integer)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_number numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  v_number:=(p_value#>>'{}')::numeric;
  return v_number=trunc(v_number) and v_number between 1 and p_max;
end;
$$;
revoke all on function private.nest_routine_integer(jsonb,integer) from public,anon,authenticated;

create function private.nest_routine_weekdays(p_days jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_day jsonb; v_result jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'Invalid weekdays' using errcode='22023';
  end if;
  if jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'Invalid weekdays' using errcode='22023';
  end if;
  for v_day in select jsonb_array_elements(p_days) loop
    if not private.nest_routine_integer(v_day,7) or v_result @> jsonb_build_array(v_day) then
      raise exception 'Invalid weekdays' using errcode='22023';
    end if;
    v_result:=v_result || jsonb_build_array((v_day#>>'{}')::numeric::integer);
  end loop;
  return v_result;
end;
$$;
revoke all on function private.nest_routine_weekdays(jsonb) from public,anon,authenticated;

create function private.nest_routine_schedule(p_rule jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_kind text:=p_rule->>'kind'; v_keys text[]; v_date date; v_field text;
begin
  v_keys:=case v_kind when 'daily' then array['kind'] when 'one_off' then array['kind','date']
    when 'weekdays' then array['kind','days'] when 'weekly' then array['kind','weekday']
    when 'biweekly' then array['kind','weekday'] when 'monthly' then array['kind','dayOfMonth']
    when 'after_completion' then array['kind','every','unit'] end;
  if jsonb_typeof(p_rule) is distinct from 'object' or v_keys is null
    or not(p_rule ?& v_keys) or p_rule-v_keys<>'{}'::jsonb then
    raise exception 'Invalid schedule' using errcode='22023';
  end if;
  if v_kind='one_off' then
    if jsonb_typeof(p_rule->'date')<>'string' or p_rule->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid date' using errcode='22023';
    end if;
    v_date:=(p_rule->>'date')::date;
    if v_date<date '0001-01-01' or to_char(v_date,'YYYY-MM-DD')<>p_rule->>'date' then
      raise exception 'Invalid date' using errcode='22023';
    end if;
  elsif v_kind='weekdays' then
    return jsonb_build_object('kind',v_kind,'days',private.nest_routine_weekdays(p_rule->'days'));
  elsif v_kind in ('weekly','biweekly','monthly','after_completion') then
    v_field:=case v_kind when 'monthly' then 'dayOfMonth' when 'after_completion' then 'every' else 'weekday' end;
    if not private.nest_routine_integer(p_rule->v_field,
      case v_kind when 'monthly' then 31 when 'after_completion' then 2147483647 else 7 end) then
      raise exception 'Invalid schedule number' using errcode='22023';
    end if;
    if v_kind='after_completion' and (p_rule->>'unit') not in ('days','weeks') then
      raise exception 'Invalid interval unit' using errcode='22023';
    end if;
    if v_kind='after_completion' and jsonb_typeof(p_rule->'unit')<>'string' then
      raise exception 'Invalid interval unit' using errcode='22023';
    end if;
    return jsonb_set(p_rule,array[v_field],to_jsonb((p_rule->>v_field)::numeric::integer));
  end if;
  return p_rule;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Invalid schedule date' using errcode='22023';
end;
$$;
revoke all on function private.nest_routine_schedule(jsonb) from public,anon,authenticated;

create function private.nest_routine_definition(p_definition jsonb,p_household uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_title text; v_assignment jsonb; v_policy text; v_keys text[]; v_member uuid; v_rule jsonb;
begin
  if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>8192
    or not(p_definition ?& array['title','schedule','assignment'])
    or p_definition-array['title','schedule','assignment']<>'{}'::jsonb
    or jsonb_typeof(p_definition->'title') is distinct from 'string' then
    raise exception 'Invalid routine definition' using errcode='22023';
  end if;
  v_title:=p_definition->>'title';
  if length(v_title)+(select count(*) from regexp_split_to_table(v_title,'') c where ascii(c)>65535)>120
    or btrim(v_title,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then
    raise exception 'Invalid routine title' using errcode='22023';
  end if;
  v_assignment:=p_definition->'assignment'; v_policy:=v_assignment->>'policy';
  v_keys:=case v_policy when 'shared' then array['policy'] when 'assigned' then array['policy','memberId']
    when 'alternating' then array['policy','anchorMemberId'] end;
  if jsonb_typeof(v_assignment) is distinct from 'object' or v_keys is null
    or not(v_assignment ?& v_keys) or v_assignment-v_keys<>'{}'::jsonb then
    raise exception 'Invalid assignment' using errcode='22023';
  end if;
  if v_policy<>'shared' then
    if jsonb_typeof(v_assignment->v_keys[2]) is distinct from 'string'
      or v_assignment->>v_keys[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid assignment member' using errcode='22023';
    end if;
    v_member:=(v_assignment->>v_keys[2])::uuid;
    if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_member) then
      raise exception 'Invalid assignment member' using errcode='22023';
    end if;
  end if;
  v_rule:=private.nest_routine_schedule(p_definition->'schedule');
  return jsonb_set(p_definition,array['schedule'],v_rule);
exception when invalid_text_representation then
  raise exception 'Invalid routine definition' using errcode='22023';
end;
$$;
revoke all on function private.nest_routine_definition(jsonb,uuid) from public,anon,authenticated;

create table public.nest_routine_creation_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_routine_creation_receipts enable row level security;
revoke all on public.nest_routine_creation_receipts from public,anon,authenticated;
grant select on public.nest_routine_creation_receipts to authenticated;
create policy own_routine_creation_receipts on public.nest_routine_creation_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_routine_creation_receipts.household_id));

create function private.nest_insert_routine(p_household uuid,p_definition jsonb)
returns public.routines language plpgsql set search_path='' as $$
declare v_routine public.routines; v_area uuid; v_first date; v_next date;
  v_rule jsonb:=p_definition->'schedule'; v_assignment jsonb:=p_definition->'assignment';
  v_kind text; v_current uuid; v_assignee uuid;
begin
  v_kind:=case v_rule->>'kind' when 'one_off' then 'one_off'
    when 'after_completion' then 'after_completion' else 'calendar' end;
  v_first:=private.first_routine_due_date(v_rule,private.household_today());
  v_next:=private.next_routine_due_date(v_rule,v_first,null,v_first);
  if v_first is null or v_first not between date '0001-01-01' and date '9999-12-31'
    or (v_next is not null and v_next not between date '0001-01-01' and date '9999-12-31') then
    raise exception 'Routine dates exceed supported range' using errcode='22023';
  end if;
  -- Compatibility FK only: no new area-management UI, no changes to historical areas.
  insert into public.areas(household_id,name,sort_order) values(p_household,'General',6)
    on conflict(household_id,name) do nothing;
  select id into v_area from public.areas where household_id=p_household and name='General';
  insert into public.routines(household_id,title,area_id,assignment_policy,assigned_member_id,
    rotation_anchor_member_id,schedule_kind,schedule_rule,priority)
    values(p_household,p_definition->>'title',v_area,v_assignment->>'policy',
      (v_assignment->>'memberId')::uuid,(v_assignment->>'anchorMemberId')::uuid,v_kind,v_rule,'general')
    returning * into v_routine;
  v_current:=private.insert_open_routine_occurrence(v_routine,'current',v_first,null);
  if v_next is not null then
    select planned_assignee_id into v_assignee from public.routine_occurrences where id=v_current;
    perform private.insert_open_routine_occurrence(v_routine,'preview',v_next,v_assignee);
  end if;
  insert into public.activity_events(household_id,actor_member_id,kind,entity_type,entity_id,payload)
    values(p_household,auth.uid(),'routine_created','routine',v_routine.id,
      jsonb_build_object('title',p_definition->>'title'));
  return v_routine;
exception when datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Routine dates exceed supported range' using errcode='22023';
end;
$$;
revoke all on function private.nest_insert_routine(uuid,jsonb) from public,anon,authenticated;

create function private.nest_create_routine(p_household uuid,p_operation uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_routine_creation_receipts;
  v_routine public.routines; v_definition jsonb; v_result jsonb; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_definition is null or octet_length(p_definition::text)>8192 then
    raise exception 'Invalid routine command' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-create:'||p_household::text,0));
  v_hash:=sha256(convert_to(p_definition::text,'UTF8'));
  select * into v_prior from public.nest_routine_creation_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Routine operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members = row_count;
  if v_members<>2 then raise exception 'Routine requires two household members' using errcode='40001'; end if;
  v_definition:=private.nest_routine_definition(p_definition,p_household);
  v_routine:=private.nest_insert_routine(p_household,v_definition);
  v_result:=jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'routineId',v_routine.id,'action','create',
    'version',to_char(timezone('UTC',v_routine.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  insert into public.nest_routine_creation_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_create_routine(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.nest_create_routine(uuid,uuid,jsonb) to authenticated;
create function public.nest_create_routine(p_household uuid,p_operation uuid,p_definition jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_create_routine($1,$2,$3);
$$;
revoke all on function public.nest_create_routine(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nest_create_routine(uuid,uuid,jsonb) to authenticated;
