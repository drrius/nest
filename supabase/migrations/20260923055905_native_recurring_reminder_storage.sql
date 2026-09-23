-- GATED: online settings and recovery only. No job or push delivery is activated.
create table public.nest_recurring_reminders (
  household_id uuid not null references public.households(id), rule_id uuid not null,
  revision uuid not null, reviewed_rule_revision uuid not null, reviewed_due_on date not null,
  updated_by uuid not null references auth.users(id),
  settings jsonb not null check(settings=private.nest_reminder_settings(settings)),
  primary key(household_id,rule_id)
);
-- Retain settings and immutable receipts independently of item lifecycle.
alter table public.nest_recurring_reminders enable row level security;
revoke all on public.nest_recurring_reminders from public,anon,authenticated,service_role;
grant select on public.nest_recurring_reminders to authenticated;
create policy nest_recurring_reminders_household_read on public.nest_recurring_reminders for select to authenticated
  using((select private.is_household_member(household_id)));
create table private.nest_recurring_reminder_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, check((request_hash is null)=(result is null)),
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_recurring_reminder_operations enable row level security;
revoke all on private.nest_recurring_reminder_operations from public,anon,authenticated,service_role;
create function private.nest_reject_recurring_reminder_history() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Recurring reminder history is immutable' using errcode='55000'; end;
$$;
revoke all on function private.nest_reject_recurring_reminder_history() from public,anon,authenticated,service_role;
create trigger nest_recurring_reminder_history_immutable before update or delete on private.nest_recurring_reminder_operations
  for each row execute function private.nest_reject_recurring_reminder_history();

create function private.nest_recurring_reminder_json(p_row public.nest_recurring_reminders)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('ruleId',p_row.rule_id,'revision',p_row.revision,
    'reviewedRuleRevision',p_row.reviewed_rule_revision,'reviewedDueOn',to_char(p_row.reviewed_due_on,'YYYY-MM-DD'),'updatedBy',p_row.updated_by,'settings',p_row.settings);
$$;
revoke all on function private.nest_recurring_reminder_json(public.nest_recurring_reminders) from public,anon,authenticated,service_role;

create function private.nest_read_recurring_reminder(p_household uuid,p_item uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.nest_recurring_rules; v_execution private.nest_recurring_execution; v_reminder jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_item from public.nest_recurring_rules where household_id=p_household and id=p_item for share;
  if not found then raise exception 'Recurring unavailable' using errcode='42501'; end if;
  select * into v_execution from private.nest_recurring_execution where household_id=p_household and rule_id=p_item for share;
  select private.nest_recurring_reminder_json(s) into v_reminder from public.nest_recurring_reminders s
    where household_id=p_household and rule_id=p_item;
  return jsonb_build_object('version',1,'householdId',p_household,
    'rule',private.nest_recurring_document(v_item,v_execution),'reminder',v_reminder);
exception when lock_not_available then raise exception 'Recurring changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_read_recurring_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_recurring_reminder(uuid,uuid) to authenticated;
create function public.nest_read_recurring_reminder(p_household uuid,p_item uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_recurring_reminder($1,$2); $$;
revoke all on function public.nest_read_recurring_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_recurring_reminder(uuid,uuid) to authenticated;

create function private.nest_recurring_reminder_command(p_operation uuid,p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_item uuid; v_expected uuid; v_baseline text; v_settings jsonb;
begin
  if p_operation is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>4096
    or not(p_input ?& array['ruleId','expectedRuleRevision','expectedDueOn','expectedRevision','settings'])
    or p_input-array['ruleId','expectedRuleRevision','expectedDueOn','expectedRevision','settings']<>'{}'::jsonb then
    raise exception 'Invalid recurring reminder command' using errcode='22023'; end if;
  v_item:=private.nest_expense_uuid(p_input->'ruleId',false)::uuid;
  v_expected:=private.nest_expense_uuid(p_input->'expectedRevision',true)::uuid;
  v_baseline:=private.nest_expense_uuid(p_input->'expectedRuleRevision',false);
  -- Reuse strict civil-date validation; the temporary disabled envelope grants no consent.
  perform private.nest_dated_reminder_settings(jsonb_build_object('enabled',false,'recipientIds','[]'::jsonb,
    'localTime','00:00','localDate',p_input->'expectedDueOn'));
  v_settings:=private.nest_reminder_settings(p_input->'settings');
  return jsonb_build_object('operationId',p_operation,'ruleId',v_item,'expectedRevision',v_expected,
    'expectedRuleRevision',v_baseline,'expectedDueOn',p_input->'expectedDueOn','settings',v_settings);
end;
$$;
revoke all on function private.nest_recurring_reminder_command(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_save_recurring_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_command jsonb; v_hash bytea; v_prior private.nest_recurring_reminder_operations;
  v_item public.nest_recurring_rules; v_execution private.nest_recurring_execution; v_row public.nest_recurring_reminders;
  v_recipient jsonb; v_result jsonb; v_id uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  v_command:=private.nest_recurring_reminder_command(p_operation,p_input);
  v_id:=(v_command->>'ruleId')::uuid; v_hash:=sha256(convert_to(v_command::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_recurring_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Reminder operation abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Reminder operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_item from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found then raise exception 'Recurring changed or unavailable' using errcode='40001'; end if;
  select * into v_execution from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found or v_item.status<>'active'
    or v_item.revision is distinct from (v_command->>'expectedRuleRevision')::uuid
    or v_execution.next_due_on is distinct from (v_command->>'expectedDueOn')::date then
    raise exception 'Recurring changed' using errcode='40001'; end if;
  select * into v_row from public.nest_recurring_reminders where household_id=p_household and rule_id=v_id for update;
  if v_row.revision is distinct from (v_command->>'expectedRevision')::uuid then
    raise exception 'Reminder changed' using errcode='40001'; end if;
  for v_recipient in select value from jsonb_array_elements(v_command->'settings'->'recipientIds') loop
    perform 1 from public.household_members where household_id=p_household and user_id=(v_recipient#>>'{}')::uuid for key share;
    if not found then raise exception 'Reminder recipient unavailable' using errcode='42501'; end if;
  end loop;
  insert into public.nest_recurring_reminders values(p_household,v_id,gen_random_uuid(),(v_command->>'expectedRuleRevision')::uuid,(v_command->>'expectedDueOn')::date,v_actor,v_command->'settings')
    on conflict(household_id,rule_id) do update set revision=excluded.revision,
      reviewed_rule_revision=excluded.reviewed_rule_revision,reviewed_due_on=excluded.reviewed_due_on,updated_by=excluded.updated_by,settings=excluded.settings returning * into v_row;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'command',v_command,'reminder',private.nest_recurring_reminder_json(v_row));
  insert into private.nest_recurring_reminder_operations values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available then raise exception 'Recurring changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_save_recurring_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_recurring_reminder(uuid,uuid,jsonb) to authenticated;
create function public.nest_save_recurring_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_recurring_reminder($1,$2,$3); $$;
revoke all on function public.nest_save_recurring_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_recurring_reminder(uuid,uuid,jsonb) to authenticated;

create function private.nest_recover_recurring_reminder(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row private.nest_recurring_reminder_operations; v_status text:='unresolved';
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_cancel is null then raise exception 'Invalid reminder operation' using errcode='22023'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_cancel then
    insert into private.nest_recurring_reminder_operations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  select * into v_row from private.nest_recurring_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then v_status:=case when v_row.result is null then 'cancelled' else 'recorded' end; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',v_status,'receipt',v_row.result);
end;
$$;
revoke all on function private.nest_recover_recurring_reminder(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.nest_recover_recurring_reminder(uuid,uuid,boolean) to authenticated;
create function public.nest_read_recurring_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_recurring_reminder($1,$2,false); $$;
create function public.nest_cancel_recurring_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_recurring_reminder($1,$2,true); $$;
revoke all on function public.nest_read_recurring_reminder_operation(uuid,uuid),public.nest_cancel_recurring_reminder_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_recurring_reminder_operation(uuid,uuid),public.nest_cancel_recurring_reminder_operation(uuid,uuid) to authenticated;
