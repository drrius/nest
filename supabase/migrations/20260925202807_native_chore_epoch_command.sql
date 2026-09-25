-- GATED: retain implementation separately and replace the original OID in place.
do $copy$ begin
  execute replace(pg_get_functiondef(
    'private.nest_complete_chore(uuid,uuid,date,date)'::regprocedure),
    'FUNCTION private.nest_complete_chore(',
    'FUNCTION private.nest_complete_chore_before_epoch(');
end; $copy$;
revoke all on function private.nest_complete_chore_before_epoch(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;

create function private.nest_complete_chore_at_epoch(p_command jsonb,p_epoch uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid(); v_household uuid; v_operation uuid; v_occurrence uuid;
  v_expected date; v_completed date;
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_command is null or jsonb_typeof(p_command)<>'object'
    or p_command - array['operationId','occurrenceId','expectedDueDate','completedOn'] <> '{}'::jsonb then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  v_operation := (p_command->>'operationId')::uuid;
  v_occurrence := (p_command->>'occurrenceId')::uuid;
  v_expected := (p_command->>'expectedDueDate')::date;
  v_completed := (p_command->>'completedOn')::date;
  if v_operation is null or v_occurrence is null or v_expected is null or v_completed is null then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  select household_id into v_household from public.routine_occurrences where id=v_occurrence;
  perform 1 from public.household_members
    where household_id=v_household and user_id=v_actor for key share;
  if not found then raise exception 'not_found' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'nest:' || v_household::text || ':' || v_actor::text || ':' || v_operation::text,0));
  if not exists(select 1 from public.nest_chore_receipts
    where household_id=v_household and actor_id=v_actor and operation_id=v_operation) then
    perform private.nest_require_offline_epoch(p_epoch);
  end if;
  -- Exact request validation and membership checks remain in the audited implementation.
  return private.nest_complete_chore_before_epoch(v_occurrence,v_operation,v_expected,v_completed);
end;
$$;
revoke all on function private.nest_complete_chore_at_epoch(jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_complete_chore_at_epoch(jsonb,uuid) to authenticated;

create function public.nest_complete_chore_at_epoch(p_command jsonb,p_epoch uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_complete_chore_at_epoch($1,$2);
$$;
revoke all on function public.nest_complete_chore_at_epoch(jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.nest_complete_chore_at_epoch(jsonb,uuid) to authenticated;

create or replace function private.nest_complete_chore(
  p_occurrence_id uuid,p_operation_id uuid,p_expected_due_date date,p_completed_on date
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_complete_chore_at_epoch(jsonb_build_object(
    'occurrenceId',$1,'operationId',$2,'expectedDueDate',$3,'completedOn',$4),null);
$$;
revoke all on function private.nest_complete_chore(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_complete_chore(uuid,uuid,date,date) to authenticated;
