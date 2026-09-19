-- GATED: additive native approval records; never apply to production without approval.
-- Commands consume these only inside the same transaction as their write/receipt.
create table public.nest_action_approvals (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  household_id uuid not null,
  invocation_id uuid not null,
  command text not null check (command in (
    'expenses.record', 'expenses.correct', 'expenses.refund', 'settlements.record',
    'groceryExpenses.record', 'recurring.create', 'recurring.update',
    'recurring.pause', 'recurring.cancel')),
  command_version integer not null check (command_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'consumed')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  decided_at timestamptz,
  consumed_at timestamptz,
  unique(actor_id, household_id, invocation_id)
);
-- Keep audit identity after membership revocation; do not cascade approval history away.
alter table public.nest_action_approvals enable row level security;
revoke all on public.nest_action_approvals from public, anon, authenticated;
grant select on public.nest_action_approvals to authenticated;
create policy own_native_approvals on public.nest_action_approvals for select to authenticated
  using (actor_id = (select auth.uid()) and exists (
    select 1 from public.household_members m
    where m.user_id = (select auth.uid()) and m.household_id = nest_action_approvals.household_id));

create function private.nest_propose_action(
  p_household uuid, p_invocation uuid, p_command text, p_version integer, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_row public.nest_action_approvals;
begin
  perform 1 from public.household_members
    where user_id = v_actor and household_id = p_household for key share;
  if v_actor is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.nest_action_approvals(actor_id, household_id, invocation_id, command, command_version, payload)
    values (v_actor, p_household, p_invocation, p_command, p_version, p_payload)
    on conflict(actor_id, household_id, invocation_id) do nothing;
  select * into strict v_row from public.nest_action_approvals
    where actor_id = v_actor and household_id = p_household and invocation_id = p_invocation for update;
  if v_row.command is distinct from p_command or v_row.command_version is distinct from p_version
    or v_row.payload is distinct from p_payload then
    raise exception 'Invocation payload changed' using errcode = '22023';
  end if;
  return v_row.id;
end;
$$;

-- Shared owner/membership check holds the approval row lock until transaction end.
create function private.nest_owned_action(p_id uuid)
  returns public.nest_action_approvals language plpgsql security definer set search_path = '' as $$
declare v_row public.nest_action_approvals;
begin
  select * into v_row from public.nest_action_approvals where id = p_id for update;
  if not found or auth.uid() is null or v_row.actor_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform 1 from public.household_members
    where user_id = auth.uid() and household_id = v_row.household_id for key share;
  if not found then raise exception 'Not authorized' using errcode = '42501'; end if;
  return v_row;
end;
$$;
revoke all on function private.nest_owned_action(uuid) from public, anon, authenticated;

create function private.nest_decide_action(
  p_id uuid, p_invocation uuid, p_command text, p_version integer, p_payload jsonb, p_approved boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_row public.nest_action_approvals;
  v_status text;
begin
  v_row := private.nest_owned_action(p_id);
  if p_approved is null or v_row.invocation_id is distinct from p_invocation
    or v_row.command is distinct from p_command or v_row.command_version is distinct from p_version
    or v_row.payload is distinct from p_payload then
    raise exception 'Approval payload changed' using errcode = '22023';
  end if;
  v_status := case when p_approved then 'approved' else 'denied' end;
  if v_row.expires_at <= clock_timestamp() then
    raise exception 'Approval expired' using errcode = '55000';
  end if;
  if v_row.status = v_status then return v_status; end if;
  if v_row.status <> 'pending' then
    raise exception 'Approval no longer pending' using errcode = '55000';
  end if;
  update public.nest_action_approvals set status = v_status, decided_at = clock_timestamp() where id = p_id;
  return v_status;
end;
$$;

-- Internal only: no public RPC facade or authenticated EXECUTE grant. A command
-- checks its operation receipt first, then consumes approval and writes atomically.
create function private.nest_consume_action_approval(
  p_id uuid, p_household uuid, p_invocation uuid, p_command text, p_version integer, p_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.nest_action_approvals;
begin
  v_row := private.nest_owned_action(p_id);
  if v_row.household_id is distinct from p_household or v_row.status <> 'approved' or v_row.expires_at <= clock_timestamp()
    or v_row.invocation_id is distinct from p_invocation or v_row.command is distinct from p_command
    or v_row.command_version is distinct from p_version or v_row.payload is distinct from p_payload then
    raise exception 'Approval not valid for this command' using errcode = '55000';
  end if;
  update public.nest_action_approvals set status = 'consumed', consumed_at = clock_timestamp() where id = p_id;
end;
$$;

revoke all on function private.nest_propose_action(uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function private.nest_decide_action(uuid,uuid,text,integer,jsonb,boolean) from public, anon, authenticated;
revoke all on function private.nest_consume_action_approval(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.nest_propose_action(uuid,uuid,text,integer,jsonb) to authenticated;
grant execute on function private.nest_decide_action(uuid,uuid,text,integer,jsonb,boolean) to authenticated;

create function public.nest_propose_action(
  p_household uuid, p_invocation uuid, p_command text, p_version integer, p_payload jsonb
) returns uuid
  language sql security invoker set search_path = '' as $$
  select private.nest_propose_action($1,$2,$3,$4,$5);
$$;
create function public.nest_decide_action(
  p_id uuid, p_invocation uuid, p_command text, p_version integer, p_payload jsonb, p_approved boolean
) returns text
  language sql security invoker set search_path = '' as $$
  select private.nest_decide_action($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_propose_action(uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.nest_decide_action(uuid,uuid,text,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.nest_propose_action(uuid,uuid,text,integer,jsonb) to authenticated;
grant execute on function public.nest_decide_action(uuid,uuid,text,integer,jsonb,boolean) to authenticated;
