-- GATED: online settings and recovery only. No job or push delivery is activated.
create table public.nest_grocery_reminders (
  household_id uuid not null references public.households(id), item_id uuid not null,
  revision uuid not null, reviewed_item_version bigint not null check(reviewed_item_version>0),
  updated_by uuid not null references auth.users(id),
  settings jsonb not null check(settings=private.nest_dated_reminder_settings(settings)),
  primary key(household_id,item_id)
);
-- No item FK: retained settings must not block legacy cleanup. Item identities are never reused.
alter table public.nest_grocery_reminders enable row level security;
revoke all on public.nest_grocery_reminders from public,anon,authenticated,service_role;
grant select on public.nest_grocery_reminders to authenticated;
create policy nest_grocery_reminders_household_read on public.nest_grocery_reminders for select to authenticated
  using((select private.is_household_member(household_id)));
create table private.nest_grocery_reminder_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, check((request_hash is null)=(result is null)),
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_grocery_reminder_operations enable row level security;
revoke all on private.nest_grocery_reminder_operations from public,anon,authenticated,service_role;
create function private.nest_reject_grocery_reminder_history() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Grocery reminder history is immutable' using errcode='55000'; end;
$$;
revoke all on function private.nest_reject_grocery_reminder_history() from public,anon,authenticated,service_role;
create trigger nest_grocery_reminder_history_immutable before update or delete on private.nest_grocery_reminder_operations
  for each row execute function private.nest_reject_grocery_reminder_history();

create function private.nest_grocery_reminder_json(p_row public.nest_grocery_reminders)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('itemId',p_row.item_id,'revision',p_row.revision,
    'reviewedItemVersion',p_row.reviewed_item_version::text,'updatedBy',p_row.updated_by,'settings',p_row.settings);
$$;
revoke all on function private.nest_grocery_reminder_json(public.nest_grocery_reminders) from public,anon,authenticated,service_role;

create function private.nest_read_grocery_reminder(p_household uuid,p_item uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.grocery_items; v_reminder jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_item from public.grocery_items where household_id=p_household and id=p_item for share;
  if not found then raise exception 'Grocery unavailable' using errcode='42501'; end if;
  if v_item.state not in ('active','claimed') or v_item.native_checked then
    raise exception 'Grocery changed' using errcode='40001'; end if;
  select private.nest_grocery_reminder_json(s) into v_reminder from public.nest_grocery_reminders s
    where household_id=p_household and item_id=p_item;
  return jsonb_build_object('version',1,'householdId',p_household,
    'itemVersion',v_item.native_version::text,
    'grocery',jsonb_build_object('itemId',p_item,'name',v_item.name,'quantity',v_item.quantity,
      'unit',v_item.unit,'categoryId',v_item.category_id,'version',v_item.native_version::text,
      'checked',v_item.native_checked,'legacyClaimed',v_item.state='claimed'),
    'reminder',v_reminder);
exception when lock_not_available then raise exception 'Grocery changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_read_grocery_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_grocery_reminder(uuid,uuid) to authenticated;
create function public.nest_read_grocery_reminder(p_household uuid,p_item uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_grocery_reminder($1,$2); $$;
revoke all on function public.nest_read_grocery_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_grocery_reminder(uuid,uuid) to authenticated;

create function private.nest_grocery_reminder_command(p_operation uuid,p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_item uuid; v_expected uuid; v_baseline text; v_settings jsonb;
begin
  if p_operation is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>4096
    or not(p_input ?& array['itemId','expectedItemVersion','expectedRevision','settings'])
    or p_input-array['itemId','expectedItemVersion','expectedRevision','settings']<>'{}'::jsonb then
    raise exception 'Invalid grocery reminder command' using errcode='22023'; end if;
  v_item:=private.nest_expense_uuid(p_input->'itemId',false)::uuid;
  v_expected:=private.nest_expense_uuid(p_input->'expectedRevision',true)::uuid;
  v_baseline:=p_input->>'expectedItemVersion';
  if jsonb_typeof(p_input->'expectedItemVersion') is distinct from 'string'
    or length(v_baseline) not between 1 and 19 or v_baseline!~'^[1-9][0-9]{0,18}$'
    or v_baseline ~ '[^0-9]' then
    raise exception 'Invalid grocery version' using errcode='22023'; end if;
  if v_baseline::numeric>9223372036854775807 then
    raise exception 'Invalid grocery version' using errcode='22023'; end if;
  v_settings:=private.nest_dated_reminder_settings(p_input->'settings');
  return jsonb_build_object('operationId',p_operation,'itemId',v_item,'expectedRevision',v_expected,
    'expectedItemVersion',v_baseline,'settings',v_settings);
end;
$$;
revoke all on function private.nest_grocery_reminder_command(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_save_grocery_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_command jsonb; v_hash bytea; v_prior private.nest_grocery_reminder_operations;
  v_item public.grocery_items; v_row public.nest_grocery_reminders;
  v_recipient jsonb; v_result jsonb; v_id uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  v_command:=private.nest_grocery_reminder_command(p_operation,p_input);
  v_id:=(v_command->>'itemId')::uuid; v_hash:=sha256(convert_to(v_command::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest:grocery-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_grocery_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Reminder operation abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Reminder operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_item from public.grocery_items where household_id=p_household and id=v_id for update;
  if not found then raise exception 'Grocery changed or unavailable' using errcode='40001'; end if;
  if v_item.state not in ('active','claimed') or v_item.native_checked
    or v_item.native_version::text<>v_command->>'expectedItemVersion' then
    raise exception 'Grocery changed' using errcode='40001'; end if;
  select * into v_row from public.nest_grocery_reminders where household_id=p_household and item_id=v_id for update;
  if v_row.revision is distinct from (v_command->>'expectedRevision')::uuid then
    raise exception 'Reminder changed' using errcode='40001'; end if;
  for v_recipient in select value from jsonb_array_elements(v_command->'settings'->'recipientIds') loop
    perform 1 from public.household_members where household_id=p_household and user_id=(v_recipient#>>'{}')::uuid for key share;
    if not found then raise exception 'Reminder recipient unavailable' using errcode='42501'; end if;
  end loop;
  insert into public.nest_grocery_reminders values(p_household,v_id,gen_random_uuid(),(v_command->>'expectedItemVersion')::bigint,v_actor,v_command->'settings')
    on conflict(household_id,item_id) do update set revision=excluded.revision,
      reviewed_item_version=excluded.reviewed_item_version,updated_by=excluded.updated_by,settings=excluded.settings returning * into v_row;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'command',v_command,'reminder',private.nest_grocery_reminder_json(v_row));
  insert into private.nest_grocery_reminder_operations values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available then raise exception 'Grocery changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_save_grocery_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_grocery_reminder(uuid,uuid,jsonb) to authenticated;
create function public.nest_save_grocery_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_grocery_reminder($1,$2,$3); $$;
revoke all on function public.nest_save_grocery_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_grocery_reminder(uuid,uuid,jsonb) to authenticated;

create function private.nest_recover_grocery_reminder(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row private.nest_grocery_reminder_operations; v_status text:='unresolved';
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_cancel is null then raise exception 'Invalid reminder operation' using errcode='22023'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Reminder requires READ COMMITTED isolation' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:grocery-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_cancel then
    insert into private.nest_grocery_reminder_operations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  select * into v_row from private.nest_grocery_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then v_status:=case when v_row.result is null then 'cancelled' else 'recorded' end; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',v_status,'receipt',v_row.result);
end;
$$;
revoke all on function private.nest_recover_grocery_reminder(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.nest_recover_grocery_reminder(uuid,uuid,boolean) to authenticated;
create function public.nest_read_grocery_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_grocery_reminder($1,$2,false); $$;
create function public.nest_cancel_grocery_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_grocery_reminder($1,$2,true); $$;
revoke all on function public.nest_read_grocery_reminder_operation(uuid,uuid),public.nest_cancel_grocery_reminder_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_grocery_reminder_operation(uuid,uuid),public.nest_cancel_grocery_reminder_operation(uuid,uuid) to authenticated;
