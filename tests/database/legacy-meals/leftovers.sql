-- Serialize leftover placement/moves against source date updates. Source updates
-- already lock their row; retaining a shared lock here closes the MVCC race.
create or replace function private.validate_leftover_meal_plan_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_entry public.meal_plan_entries%rowtype;
begin
  if exists (
    select 1 from public.meal_plan_entries as child
    where child.household_id = new.household_id
      and child.leftover_of_entry_id = new.id
      and child.removed_at is null
      and (child.date <= new.date or new.leftover_of_entry_id is not null)
  ) then
    raise exception 'source change would invalidate an existing leftover'
      using errcode = '23514';
  end if;
  if new.leftover_of_entry_id is null then return new; end if;

  select entry.* into source_entry
  from public.meal_plan_entries as entry
  where entry.household_id = new.household_id
    and entry.id = new.leftover_of_entry_id
  for share;

  if not found then
    raise exception 'leftover source does not belong to the household'
      using errcode = '23503';
  end if;
  if source_entry.removed_at is not null then
    raise exception 'leftover source has been removed' using errcode = '23514';
  end if;
  if source_entry.leftover_of_entry_id is not null then
    raise exception 'a leftover cannot reference another leftover' using errcode = '23514';
  end if;
  if source_entry.date >= new.date then
    raise exception 'leftover source must be earlier than the target entry' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_leftover_meal_plan_entry() from public, anon, authenticated;
