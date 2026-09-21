-- GATED: abandon an uncommitted direct cycle Save; never reverse a recorded expense.
create table public.nest_recurring_cycle_save_cancellations (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  cancelled_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recurring_cycle_save_cancellations enable row level security;
revoke all on public.nest_recurring_cycle_save_cancellations from public,anon,authenticated;
grant select on public.nest_recurring_cycle_save_cancellations to authenticated;
create policy own_recurring_cycle_save_cancellations on public.nest_recurring_cycle_save_cancellations for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_recurring_cycle_save_cancellations_are_append_only
before update or delete on public.nest_recurring_cycle_save_cancellations
for each row execute function private.reject_financial_history_change();

create function private.nest_read_recurring_cycle_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb; v_status text;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  select result into v_receipt from public.nest_recurring_cycle_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  v_status:=case when v_receipt is not null then 'recorded'
    when exists(select 1 from public.nest_recurring_cycle_save_cancellations
      where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then 'cancelled'
    else 'unresolved' end;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',v_status,'receipt',v_receipt);
end;
$$;
revoke all on function private.nest_read_recurring_cycle_save(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_recurring_cycle_save(uuid,uuid) to authenticated;

create function private.nest_cancel_recurring_cycle_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-cycle-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select result into v_receipt from public.nest_recurring_cycle_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  if v_receipt is null then
    insert into public.nest_recurring_cycle_save_cancellations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',case when v_receipt is null then 'cancelled' else 'recorded' end,
    'receipt',v_receipt);
end;
$$;
revoke all on function private.nest_cancel_recurring_cycle_save(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_cancel_recurring_cycle_save(uuid,uuid) to authenticated;

create or replace function private.nest_save_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-cycle-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if exists(select 1 from public.nest_recurring_cycle_save_cancellations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    raise exception 'Recurring cycle Save cancelled' using errcode='40001'; end if;
  return private.nest_record_variable_cycle(p_household,p_operation,p_input,null);
end;
$$;
revoke all on function private.nest_save_variable_cycle(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.nest_save_variable_cycle(uuid,uuid,jsonb) to authenticated;

create function public.nest_read_recurring_cycle_save(p_household uuid,p_operation uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_recurring_cycle_save($1,$2);
$$;
create function public.nest_cancel_recurring_cycle_save(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_cancel_recurring_cycle_save($1,$2);
$$;
revoke all on function public.nest_read_recurring_cycle_save(uuid,uuid) from public,anon,authenticated;
revoke all on function public.nest_cancel_recurring_cycle_save(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_recurring_cycle_save(uuid,uuid) to authenticated;
grant execute on function public.nest_cancel_recurring_cycle_save(uuid,uuid) to authenticated;
