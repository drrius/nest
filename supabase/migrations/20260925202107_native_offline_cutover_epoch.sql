-- GATED: additive control only. Deployment and rotation require separate approval.
-- Command adapters must bind this value to saved intent before cutover is enabled.
alter table private.nest_household_write_control
  add column offline_epoch uuid not null default gen_random_uuid(),
  add column offline_epoch_required boolean not null default false;

create function private.nest_rotate_offline_epoch() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_frozen boolean; v_epoch uuid;
begin
  perform private.nest_assert_household_write_barrier();
  select frozen into v_frozen from private.nest_household_write_control
    where singleton for update;
  if v_frozen is distinct from true then
    raise exception 'Freeze household writes before rotating offline epoch' using errcode='55000';
  end if;
  update private.nest_household_write_control
    set offline_epoch=gen_random_uuid(), offline_epoch_required=true
    where singleton returning offline_epoch into v_epoch;
  return v_epoch;
end;
$$;
revoke all on function private.nest_rotate_offline_epoch() from public,anon,authenticated,service_role;

-- Called inside the same transaction as a new offline command, after authorization
-- and historical receipt recovery. The lock is held until that command commits.
create function private.nest_require_offline_epoch(p_epoch uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_control private.nest_household_write_control%rowtype;
begin
  select * into v_control from private.nest_household_write_control where singleton for share;
  if not found or v_control.frozen then
    raise exception 'Household writes suspended' using errcode='PT503';
  end if;
  -- Additive rollout accepts existing binaries only until the first explicit cutover.
  -- Rotation enables enforcement; unfreezing never disables it.
  if (p_epoch is null and v_control.offline_epoch_required)
    or (p_epoch is not null and p_epoch is distinct from v_control.offline_epoch) then
    raise exception 'Offline command requires cutover reconciliation' using errcode='PT409';
  end if;
end;
$$;
revoke all on function private.nest_require_offline_epoch(uuid) from public,anon,authenticated,service_role;

-- STABLE composition shares one statement snapshot with the authorized data reader.
-- Clients capture this epoch with their baseline, never at retry/dispatch time.
create function private.nest_offline_epoch_snapshot(p_household uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_epoch uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.household_members
    where household_id=p_household and user_id=auth.uid()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select offline_epoch into v_epoch from private.nest_household_write_control where singleton;
  if v_epoch is null then
    raise exception 'Household write control missing' using errcode='PT503';
  end if;
  return jsonb_build_object('offlineEpoch',v_epoch);
end;
$$;
revoke all on function private.nest_offline_epoch_snapshot(uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_offline_epoch_snapshot(uuid) to authenticated;
