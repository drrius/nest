-- The native command validates these dates already, but retained public callers
-- reach the shared closure engine directly. Harden new writes without rewriting
-- legacy completions or invalidating an already committed command's exact replay.
create or replace function public.complete_occurrence(
  p_occurrence_id uuid, p_idempotency_key text, p_completed_on date,
  p_note text default null, p_photo_path text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_completed_on is null or not isfinite(p_completed_on)
    or extract(year from p_completed_on) not between 1 and 9999
    or p_completed_on > private.household_today()
  then
    if not exists (
      select 1 from public.routine_command_receipts r
      join public.routine_occurrences o on o.household_id = r.household_id and o.id = r.occurrence_id
      join public.household_members m on m.household_id = r.household_id and m.user_id = auth.uid()
      where r.occurrence_id = p_occurrence_id and r.idempotency_key = p_idempotency_key
        and r.command_kind = 'complete'
    ) then
      raise exception 'invalid_completed_date' using errcode = '22023';
    end if;
  end if;
  return private.apply_routine_closure(
    p_occurrence_id, p_idempotency_key, 'complete', p_completed_on, null, p_note, p_photo_path
  );
end $$;
revoke all on function public.complete_occurrence(uuid,text,date,text,text) from public,anon;
grant execute on function public.complete_occurrence(uuid,text,date,text,text) to authenticated;
