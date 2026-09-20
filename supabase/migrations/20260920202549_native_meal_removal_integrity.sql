-- Deployment remains separately gated. Do not rewrite existing meal history.
-- UPDATE holds the source row lock, conflicting with the existing leftover
-- validator's FOR SHARE lock. Its VOLATILE reads see children committed while
-- the source UPDATE waited for that lock.
create or replace function private.nest_guard_meal_source_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A repeatable snapshot can hide a child committed after it was taken even
  -- after the row lock is acquired. Fail closed rather than accept that write.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Meal removal requires a fresh read-committed transaction'
      using errcode = '40001';
  end if;
  if exists (
    select 1 from public.meal_plan_entries as child
    where child.household_id = old.household_id
      and child.leftover_of_entry_id = old.id
      and child.removed_at is null
  ) then
    raise exception 'Remove active leftovers before their source meal'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.nest_guard_meal_source_removal()
  from public, anon, authenticated;

create trigger meal_plan_entries_guard_source_removal
before update of removed_at on public.meal_plan_entries
for each row
when (old.removed_at is null and new.removed_at is not null)
execute function private.nest_guard_meal_source_removal();

-- Legacy restore writes must acquire the same source lock and revalidate the
-- source date/type/removal state; changing removed_at previously skipped it.
create trigger meal_plan_entries_validate_restoration
before update of removed_at on public.meal_plan_entries
for each row
when (old.removed_at is not null and new.removed_at is null)
execute function private.validate_leftover_meal_plan_entry();
