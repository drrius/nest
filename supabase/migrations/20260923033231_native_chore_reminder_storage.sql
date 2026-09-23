-- GATED: online settings and recovery only. No job or push delivery is activated.
create table public.nest_chore_reminders (
  household_id uuid not null references public.households(id), occurrence_id uuid not null,
  revision uuid not null, reviewed_item_revision text not null check(reviewed_item_revision ~ '^[a-f0-9]{64}$'),
  updated_by uuid not null references auth.users(id),
  settings jsonb not null check(settings=private.nest_reminder_settings(settings)),
  primary key(household_id,occurrence_id)
);
-- No occurrence FK: definition rebuilds may remove occurrences; retained settings
-- must never be reattached to the replacement occurrence or block that rebuild.
alter table public.nest_chore_reminders enable row level security;
revoke all on public.nest_chore_reminders from public,anon,authenticated,service_role;
grant select on public.nest_chore_reminders to authenticated;
create policy nest_chore_reminders_household_read on public.nest_chore_reminders for select to authenticated
  using((select private.is_household_member(household_id)));
create table private.nest_chore_reminder_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, check((request_hash is null)=(result is null)),
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_chore_reminder_operations enable row level security;
revoke all on private.nest_chore_reminder_operations from public,anon,authenticated,service_role;
create function private.nest_reject_chore_reminder_history() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Chore reminder history is immutable' using errcode='55000'; end;
$$;
revoke all on function private.nest_reject_chore_reminder_history() from public,anon,authenticated,service_role;
create trigger nest_chore_reminder_history_immutable before update or delete on private.nest_chore_reminder_operations
  for each row execute function private.nest_reject_chore_reminder_history();

create function private.nest_chore_reminder_baseline(p_occurrence public.routine_occurrences,p_routine public.routines)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'household',p_occurrence.household_id,'occurrence',p_occurrence.id,'routine',p_routine.id,
    'routineVersion',to_char(timezone('UTC',p_routine.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'title',p_routine.title,'paused',p_routine.paused_at is not null,'archived',p_routine.archived_at is not null,
    'due',p_occurrence.due_date,'status',p_occurrence.status,'role',p_occurrence.role,
    'assignmentRevision',p_occurrence.nest_assignment_revision::text,
    'assignee',coalesce(p_occurrence.nest_accepted_assignee_id,p_occurrence.planned_assignee_id)
  )::text,'UTF8')),'hex');
$$;
revoke all on function private.nest_chore_reminder_baseline(public.routine_occurrences,public.routines) from public,anon,authenticated,service_role;
create function private.nest_chore_reminder_json(p_row public.nest_chore_reminders)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('occurrenceId',p_row.occurrence_id,'revision',p_row.revision,
    'reviewedItemRevision',p_row.reviewed_item_revision,'updatedBy',p_row.updated_by,'settings',p_row.settings);
$$;
revoke all on function private.nest_chore_reminder_json(public.nest_chore_reminders) from public,anon,authenticated,service_role;

create function private.nest_read_chore_reminder(p_household uuid,p_occurrence uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_occurrence public.routine_occurrences; v_routine public.routines; v_reminder jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_occurrence from public.routine_occurrences where household_id=p_household and id=p_occurrence for share;
  if not found then raise exception 'Chore unavailable' using errcode='42501'; end if;
  select * into v_routine from public.routines where household_id=p_household and id=v_occurrence.routine_id for share nowait;
  if not found or v_routine.archived_at is not null or v_routine.paused_at is not null
    or v_occurrence.status<>'open' or v_occurrence.role is distinct from 'current' then
    raise exception 'Chore changed' using errcode='40001'; end if;
  select private.nest_chore_reminder_json(s) into v_reminder from public.nest_chore_reminders s
    where household_id=p_household and occurrence_id=p_occurrence;
  return jsonb_build_object('version',1,'householdId',p_household,
    'itemRevision',private.nest_chore_reminder_baseline(v_occurrence,v_routine),
    'chore',jsonb_build_object('occurrenceId',p_occurrence,'title',v_routine.title,'dueDate',v_occurrence.due_date,
      'assigneeId',coalesce(v_occurrence.nest_accepted_assignee_id,v_occurrence.planned_assignee_id)),
    'reminder',v_reminder);
exception when lock_not_available then raise exception 'Chore changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_read_chore_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_chore_reminder(uuid,uuid) to authenticated;
create function public.nest_read_chore_reminder(p_household uuid,p_occurrence uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_chore_reminder($1,$2); $$;
revoke all on function public.nest_read_chore_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_chore_reminder(uuid,uuid) to authenticated;

create function private.nest_chore_reminder_command(p_operation uuid,p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_occurrence uuid; v_expected uuid; v_baseline text; v_settings jsonb;
begin
  if p_operation is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>4096
    or not(p_input ?& array['occurrenceId','expectedItemRevision','expectedRevision','settings'])
    or p_input-array['occurrenceId','expectedItemRevision','expectedRevision','settings']<>'{}'::jsonb then
    raise exception 'Invalid chore reminder command' using errcode='22023'; end if;
  v_occurrence:=private.nest_expense_uuid(p_input->'occurrenceId',false)::uuid;
  v_expected:=private.nest_expense_uuid(p_input->'expectedRevision',true)::uuid;
  v_baseline:=p_input->>'expectedItemRevision';
  if jsonb_typeof(p_input->'expectedItemRevision') is distinct from 'string'
    or length(v_baseline)<>64 or v_baseline!~'^[a-f0-9]{64}$' then
    raise exception 'Invalid chore baseline' using errcode='22023'; end if;
  v_settings:=private.nest_reminder_settings(p_input->'settings');
  return jsonb_build_object('operationId',p_operation,'occurrenceId',v_occurrence,'expectedRevision',v_expected,
    'expectedItemRevision',v_baseline,'settings',v_settings);
end;
$$;
revoke all on function private.nest_chore_reminder_command(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_save_chore_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_command jsonb; v_hash bytea; v_prior private.nest_chore_reminder_operations;
  v_occurrence public.routine_occurrences; v_routine public.routines; v_row public.nest_chore_reminders;
  v_recipient jsonb; v_result jsonb; v_id uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  v_command:=private.nest_chore_reminder_command(p_operation,p_input);
  v_id:=(v_command->>'occurrenceId')::uuid; v_hash:=sha256(convert_to(v_command::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest:chore-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_chore_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Reminder operation abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Reminder operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_occurrence from public.routine_occurrences where household_id=p_household and id=v_id for update;
  if not found then raise exception 'Chore changed or unavailable' using errcode='40001'; end if;
  select * into v_routine from public.routines where household_id=p_household and id=v_occurrence.routine_id for update nowait;
  if not found or v_routine.archived_at is not null or v_routine.paused_at is not null
    or v_occurrence.status<>'open' or v_occurrence.role is distinct from 'current'
    or private.nest_chore_reminder_baseline(v_occurrence,v_routine)<>v_command->>'expectedItemRevision' then
    raise exception 'Chore changed' using errcode='40001'; end if;
  select * into v_row from public.nest_chore_reminders where household_id=p_household and occurrence_id=v_id for update;
  if v_row.revision is distinct from (v_command->>'expectedRevision')::uuid then
    raise exception 'Reminder changed' using errcode='40001'; end if;
  for v_recipient in select value from jsonb_array_elements(v_command->'settings'->'recipientIds') loop
    perform 1 from public.household_members where household_id=p_household and user_id=(v_recipient#>>'{}')::uuid for key share;
    if not found then raise exception 'Reminder recipient unavailable' using errcode='42501'; end if;
  end loop;
  if v_occurrence.due_date-(v_command->'settings'->>'daysBefore')::integer<date '0001-01-01'
    or extract(year from v_occurrence.due_date) not between 1 and 9999 then
    raise exception 'Unsupported reminder date' using errcode='22023'; end if;
  insert into public.nest_chore_reminders values(p_household,v_id,gen_random_uuid(),v_command->>'expectedItemRevision',v_actor,v_command->'settings')
    on conflict(household_id,occurrence_id) do update set revision=excluded.revision,
      reviewed_item_revision=excluded.reviewed_item_revision,updated_by=excluded.updated_by,settings=excluded.settings returning * into v_row;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'command',v_command,'reminder',private.nest_chore_reminder_json(v_row));
  insert into private.nest_chore_reminder_operations values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available then raise exception 'Chore changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_save_chore_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_chore_reminder(uuid,uuid,jsonb) to authenticated;
create function public.nest_save_chore_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_chore_reminder($1,$2,$3); $$;
revoke all on function public.nest_save_chore_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_chore_reminder(uuid,uuid,jsonb) to authenticated;

create function private.nest_recover_chore_reminder(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row private.nest_chore_reminder_operations; v_status text:='unresolved';
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_cancel is null then raise exception 'Invalid reminder operation' using errcode='22023'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:chore-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_cancel then
    insert into private.nest_chore_reminder_operations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  select * into v_row from private.nest_chore_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then v_status:=case when v_row.result is null then 'cancelled' else 'recorded' end; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',v_status,'receipt',v_row.result);
end;
$$;
revoke all on function private.nest_recover_chore_reminder(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.nest_recover_chore_reminder(uuid,uuid,boolean) to authenticated;
create function public.nest_read_chore_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_chore_reminder($1,$2,false); $$;
create function public.nest_cancel_chore_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_chore_reminder($1,$2,true); $$;
revoke all on function public.nest_read_chore_reminder_operation(uuid,uuid),public.nest_cancel_chore_reminder_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_chore_reminder_operation(uuid,uuid),public.nest_cancel_chore_reminder_operation(uuid,uuid) to authenticated;
