-- GATED: reminder settings only; no scheduling, push delivery or production migration.
create function private.nest_reminder_settings(p_settings jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_ids jsonb; v_id jsonb; v_uuid uuid; v_days integer;
begin
  if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object'
    or octet_length(p_settings::text)>2048
    or not(p_settings ?& array['enabled','recipientIds','localTime','daysBefore'])
    or p_settings-array['enabled','recipientIds','localTime','daysBefore']<>'{}'::jsonb
    or jsonb_typeof(p_settings->'enabled') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'recipientIds') is distinct from 'array'
    or jsonb_typeof(p_settings->'localTime') is distinct from 'string'
    or jsonb_typeof(p_settings->'daysBefore') is distinct from 'number' then
    raise exception 'Invalid reminder settings' using errcode='22023'; end if;
  if length(p_settings->>'localTime')<>5 or (p_settings->>'localTime')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (p_settings->>'daysBefore')!~'^[0-9]+$' then
    raise exception 'Invalid reminder timing' using errcode='22023'; end if;
  v_days:=(p_settings->>'daysBefore')::integer;
  if v_days not between 0 and 730 or jsonb_array_length(p_settings->'recipientIds')>2
    or ((p_settings->>'enabled')::boolean and jsonb_array_length(p_settings->'recipientIds')=0) then
    raise exception 'Invalid reminder recipients or lead time' using errcode='22023'; end if;
  v_ids:='[]'::jsonb;
  for v_id in select value from jsonb_array_elements(p_settings->'recipientIds') loop
    v_uuid:=private.nest_expense_uuid(v_id,false)::uuid;
    if v_ids @> jsonb_build_array(v_uuid) then
      raise exception 'Duplicate reminder recipient' using errcode='22023'; end if;
    v_ids:=v_ids||jsonb_build_array(v_uuid);
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_ids from jsonb_array_elements(v_ids);
  return p_settings||jsonb_build_object('recipientIds',v_ids);
end;
$$;
revoke all on function private.nest_reminder_settings(jsonb) from public,anon,authenticated,service_role;

create table public.nest_renewal_reminders (
  household_id uuid not null, renewal_id uuid not null,
  revision uuid not null, reviewed_renewal_revision uuid not null, updated_by uuid not null,
  anchor text not null check(anchor in ('renewal','cancellation')),
  delivery jsonb not null check(delivery=private.nest_reminder_settings(delivery)),
  primary key(household_id,renewal_id),
  foreign key(household_id,renewal_id) references public.nest_renewals(household_id,id),
  foreign key(household_id,updated_by) references public.household_members(household_id,user_id)
);
alter table public.nest_renewal_reminders enable row level security;
revoke all on public.nest_renewal_reminders from public,anon,authenticated,service_role;
grant select on public.nest_renewal_reminders to authenticated;
create policy nest_renewal_reminders_household_read on public.nest_renewal_reminders for select to authenticated
  using((select private.is_household_member(household_id)));
create table private.nest_renewal_reminder_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, check((request_hash is null)=(result is null)),
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_renewal_reminder_operations enable row level security;
revoke all on private.nest_renewal_reminder_operations from public,anon,authenticated,service_role;
create trigger nest_renewal_reminder_operations_immutable before update or delete on private.nest_renewal_reminder_operations
  for each row execute function private.reject_financial_history_change();

create function private.nest_renewal_reminder_json(p_row public.nest_renewal_reminders)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('renewalId',p_row.renewal_id,'revision',p_row.revision,
    'reviewedRenewalRevision',p_row.reviewed_renewal_revision,'updatedBy',p_row.updated_by,
    'settings',jsonb_build_object('anchor',p_row.anchor,'delivery',p_row.delivery));
$$;
revoke all on function private.nest_renewal_reminder_json(public.nest_renewal_reminders) from public,anon,authenticated,service_role;

create function public.nest_save_renewal_reminder(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_expected uuid; v_item_revision uuid;
  v_delivery jsonb; v_anchor text; v_recipient jsonb; v_command jsonb; v_hash bytea; v_result jsonb;
  v_item public.nest_renewals; v_row public.nest_renewal_reminders; v_prior private.nest_renewal_reminder_operations;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>4096
    or not(p_input ?& array['renewalId','expectedRenewalRevision','expectedRevision','settings'])
    or p_input-array['renewalId','expectedRenewalRevision','expectedRevision','settings']<>'{}'::jsonb then
    raise exception 'Invalid reminder command' using errcode='22023'; end if;
  v_id:=private.nest_expense_uuid(p_input->'renewalId',false)::uuid;
  v_item_revision:=private.nest_expense_uuid(p_input->'expectedRenewalRevision',false)::uuid;
  v_expected:=private.nest_expense_uuid(p_input->'expectedRevision',true)::uuid;
  if jsonb_typeof(p_input->'settings') is distinct from 'object'
    or not(p_input->'settings' ?& array['anchor','delivery'])
    or (p_input->'settings')-array['anchor','delivery']<>'{}'::jsonb
    or jsonb_typeof(p_input->'settings'->'anchor') is distinct from 'string' then
    raise exception 'Invalid renewal reminder settings' using errcode='22023'; end if;
  v_anchor:=p_input->'settings'->>'anchor';
  if v_anchor not in ('renewal','cancellation') then raise exception 'Invalid reminder anchor' using errcode='22023'; end if;
  v_delivery:=private.nest_reminder_settings(p_input->'settings'->'delivery');
  v_command:=jsonb_build_object('operationId',p_operation,'renewalId',v_id,'expectedRevision',v_expected,
    'expectedRenewalRevision',v_item_revision,'settings',jsonb_build_object('anchor',v_anchor,'delivery',v_delivery));
  v_hash:=sha256(convert_to(v_command::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest:renewal-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_renewal_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Reminder operation abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Reminder operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_item from public.nest_renewals where household_id=p_household and id=v_id for update;
  if not found or v_item.removed or v_item.revision<>v_item_revision then
    raise exception 'Renewal changed or unavailable' using errcode='40001'; end if;
  select * into v_row from public.nest_renewal_reminders where household_id=p_household and renewal_id=v_id for update;
  if v_row.revision is distinct from v_expected then raise exception 'Reminder changed' using errcode='40001'; end if;
  for v_recipient in select value from jsonb_array_elements(v_delivery->'recipientIds') loop
    perform 1 from public.household_members where household_id=p_household and user_id=(v_recipient#>>'{}')::uuid for key share;
    if not found then raise exception 'Reminder recipient unavailable' using errcode='42501'; end if;
  end loop;
  if v_item.renewal_on-(case when v_anchor='cancellation' then v_item.notice_days else 0 end)
    -(v_delivery->>'daysBefore')::integer<date '0001-01-01' then
    raise exception 'Unsupported reminder date' using errcode='22023'; end if;
  insert into public.nest_renewal_reminders values(p_household,v_id,gen_random_uuid(),v_item_revision,v_actor,v_anchor,v_delivery)
    on conflict(household_id,renewal_id) do update set revision=excluded.revision,
      reviewed_renewal_revision=excluded.reviewed_renewal_revision,updated_by=excluded.updated_by,
      anchor=excluded.anchor,delivery=excluded.delivery returning * into v_row;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'command',v_command,'reminder',private.nest_renewal_reminder_json(v_row));
  insert into private.nest_renewal_reminder_operations values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function public.nest_save_renewal_reminder(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_renewal_reminder(uuid,uuid,jsonb) to authenticated;

create function public.nest_read_renewal_reminder(p_household uuid,p_renewal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.nest_renewal_reminders; v_reminder jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.nest_renewals where household_id=p_household and id=p_renewal;
  if not found then raise exception 'Renewal unavailable' using errcode='42501'; end if;
  select * into v_row from public.nest_renewal_reminders where household_id=p_household and renewal_id=p_renewal;
  if found then v_reminder:=private.nest_renewal_reminder_json(v_row); end if;
  return jsonb_build_object('version',1,'householdId',p_household,'renewalId',p_renewal,'reminder',v_reminder);
end;
$$;
revoke all on function public.nest_read_renewal_reminder(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_renewal_reminder(uuid,uuid) to authenticated;

create function private.nest_recover_renewal_reminder(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row private.nest_renewal_reminder_operations; v_status text:='unresolved';
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_cancel is null then raise exception 'Invalid renewal operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:renewal-reminder-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_cancel then
    insert into private.nest_renewal_reminder_operations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  select * into v_row from private.nest_renewal_reminder_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then v_status:=case when v_row.result is null then 'cancelled' else 'recorded' end; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',v_status,'receipt',v_row.result);
end;
$$;
revoke all on function private.nest_recover_renewal_reminder(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.nest_read_renewal_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select private.nest_recover_renewal_reminder($1,$2,false); $$;
create function public.nest_cancel_renewal_reminder_operation(p_household uuid,p_operation uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select private.nest_recover_renewal_reminder($1,$2,true); $$;
revoke all on function public.nest_read_renewal_reminder_operation(uuid,uuid),public.nest_cancel_renewal_reminder_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_renewal_reminder_operation(uuid,uuid),public.nest_cancel_renewal_reminder_operation(uuid,uuid) to authenticated;
