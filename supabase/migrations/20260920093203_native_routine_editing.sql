-- GATED candidate. Reuse the audited legacy CAS/recurrence engine; no hosted application.
create table public.nest_routine_edit_receipts (
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_routine_edit_receipts enable row level security;
revoke all on public.nest_routine_edit_receipts from public,anon,authenticated;
grant select on public.nest_routine_edit_receipts to authenticated;
create policy own_routine_edit_receipts on public.nest_routine_edit_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_routine_edit_patch(p_patch jsonb,p_household uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_definition jsonb; v_patch jsonb:='{}'; v_assignment jsonb; v_rule jsonb; v_first date; v_next date;
begin
  if p_patch is null or jsonb_typeof(p_patch) is distinct from 'object'
    or p_patch='{}'::jsonb or octet_length(p_patch::text)>8192
    or p_patch-array['title','schedule','assignment']<>'{}'::jsonb then
    raise exception 'Invalid routine patch' using errcode='22023';
  end if;
  -- Validate supplied fields only. Placeholders never reach storage; omitted legacy
  -- fields, including titles longer than the new input limit, remain untouched.
  v_definition:=private.nest_routine_definition(
    '{"title":"Unchanged","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}'::jsonb||p_patch,p_household);
  if p_patch ? 'title' then v_patch:=v_patch||jsonb_build_object('title',v_definition->'title'); end if;
  if p_patch ? 'schedule' then
    v_rule:=v_definition->'schedule';
    v_first:=private.first_routine_due_date(v_rule,private.household_today());
    v_next:=private.next_routine_due_date(v_rule,v_first,v_first,v_first);
    if extract(year from v_first) not between 1 and 9999 or extract(year from v_next) not between 1 and 9999 then
      raise exception 'Routine dates exceed supported range' using errcode='22023';
    end if;
    v_patch:=v_patch||jsonb_build_object('schedule_rule',v_rule,'schedule_kind',
      case v_rule->>'kind' when 'one_off' then 'one_off' when 'after_completion' then 'after_completion' else 'calendar' end);
  end if;
  if p_patch ? 'assignment' then
    v_assignment:=v_definition->'assignment';
    v_patch:=v_patch||jsonb_build_object('assignment_policy',v_assignment->>'policy',
      'assigned_member_id',v_assignment->'memberId','rotation_anchor_member_id',v_assignment->'anchorMemberId');
  end if;
  return v_patch;
exception when datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Routine dates exceed supported range' using errcode='22023';
end;
$$;
revoke all on function private.nest_routine_edit_patch(jsonb,uuid) from public,anon,authenticated;

create function private.nest_routine_edit_version(p_version text)
returns timestamptz language plpgsql immutable set search_path='' as $$
declare v_time timestamptz;
begin
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$' then
    raise exception 'Invalid routine version' using errcode='22023';
  end if;
  v_time:=p_version::timestamptz;
  if to_char(timezone('UTC',v_time),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')<>p_version then
    raise exception 'Invalid routine version' using errcode='22023';
  end if;
  return v_time;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Invalid routine version' using errcode='22023';
end;
$$;
revoke all on function private.nest_routine_edit_version(text) from public,anon,authenticated;

create function private.nest_edit_routine(p_household uuid,p_operation uuid,p_routine uuid,p_expected text,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_routine_edit_receipts;
  v_version timestamptz; v_result jsonb; v_patch jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_routine is null or p_patch is null or octet_length(p_patch::text)>8192 then
    raise exception 'Invalid routine edit' using errcode='22023';
  end if;
  v_version:=private.nest_routine_edit_version(p_expected);
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-edit:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('routine',p_routine,'version',p_expected,'patch',p_patch)::text,'UTF8'));
  select * into v_prior from public.nest_routine_edit_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Routine operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if not exists(select 1 from public.routines where id=p_routine and household_id=p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  v_patch:=private.nest_routine_edit_patch(p_patch,p_household);
  -- The internal legacy key is unpredictable and never supplied by clients. Native
  -- replay uses the actor-bound receipt above, so old clients cannot preseed its key.
  perform public.edit_routine_definition(p_routine,v_version,'nest:'||gen_random_uuid()::text,v_patch);
  if exists(select 1 from public.routine_occurrences where routine_id=p_routine and status='open'
    and (extract(year from due_date) not between 1 and 9999 or extract(year from original_due_date) not between 1 and 9999)) then
    raise exception 'Routine dates exceed supported range' using errcode='22023';
  end if;
  select updated_at into v_version from public.routines where id=p_routine;
  v_result:=jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'routineId',p_routine,'action','edit','version',to_char(timezone('UTC',v_version),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  insert into public.nest_routine_edit_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_edit_routine(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.nest_edit_routine(uuid,uuid,uuid,text,jsonb) to authenticated;
create function public.nest_edit_routine(p_household uuid,p_operation uuid,p_routine uuid,p_expected text,p_patch jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_edit_routine($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_edit_routine(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nest_edit_routine(uuid,uuid,uuid,text,jsonb) to authenticated;
