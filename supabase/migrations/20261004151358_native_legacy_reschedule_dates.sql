-- Keep retained recurrence and receipts intact while preventing new dates that
-- Nest's native civil-date contract cannot represent.
create or replace function public.reschedule_occurrence(
  p_occurrence_id uuid, p_new_due_date date, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_new_due_date is null or not isfinite(p_new_due_date)
    or extract(year from p_new_due_date) not between 1 and 9999
  then
    if not exists (
      select 1 from public.routine_command_receipts r
      join public.routine_occurrences o on o.household_id = r.household_id and o.id = r.occurrence_id
      join public.household_members m on m.household_id = r.household_id and m.user_id = auth.uid()
      where r.occurrence_id = p_occurrence_id and r.idempotency_key = p_idempotency_key
        and r.command_kind = 'reschedule'
    ) then
      raise exception 'invalid_reschedule_date' using errcode = '22023';
    end if;
  end if;
  return private.apply_routine_closure(
    p_occurrence_id, p_idempotency_key, 'reschedule', null, p_new_due_date, null, null
  );
end $$;
revoke all on function public.reschedule_occurrence(uuid,date,text) from public,anon;
grant execute on function public.reschedule_occurrence(uuid,date,text) to authenticated;
