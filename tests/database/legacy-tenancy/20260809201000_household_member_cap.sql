create or replace function private.enforce_household_member_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  select count(*)::integer
  into current_count
  from public.household_members
  where household_id = new.household_id;

  if current_count >= 2 then
    raise exception 'household % already has the version-one member cap of 2',
      new.household_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_household_member_cap() from public, anon, authenticated;
grant execute on function private.enforce_household_member_cap() to service_role;

drop trigger if exists household_members_enforce_cap on public.household_members;

create trigger household_members_enforce_cap
before insert on public.household_members
for each row
execute function private.enforce_household_member_cap();

comment on function private.enforce_household_member_cap() is
  'Rejects a third household_members row for the same household.';
