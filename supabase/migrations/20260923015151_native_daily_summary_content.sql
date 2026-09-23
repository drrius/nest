-- GATED deterministic content. No model calls, personal calendars or private AI data.
create function private.nest_summary_count(p_count bigint)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('count',least(p_count,1000),'more',p_count>1000);
$$;
revoke all on function private.nest_summary_count(bigint) from public,anon,authenticated,service_role;

create function private.nest_daily_summary_content(p_household uuid,p_recipient uuid,p_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_due bigint; v_overdue bigint; v_meals bigint; v_renewals bigint; v_deadlines bigint;
begin
  if p_date is null or not isfinite(p_date) or p_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Invalid summary date' using errcode='22023'; end if;
  if not exists(select 1 from public.household_members m
    join public.nest_notification_preferences p on p.household_id=m.household_id and p.actor_id=m.user_id
    where m.household_id=p_household and m.user_id=p_recipient and p.daily_summary_enabled) then
    return null;
  end if;
  select count(*) into v_due from (
    select o.id from public.routine_occurrences o join public.routines r
      on r.household_id=o.household_id and r.id=o.routine_id
    where o.household_id=p_household and o.status='open' and o.role='current' and o.due_date=p_date
      and r.archived_at is null and r.paused_at is null
      and (coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id) is null
        or coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id)=p_recipient) limit 1001
  ) items;
  select count(*) into v_overdue from (
    select o.id from public.routine_occurrences o join public.routines r
      on r.household_id=o.household_id and r.id=o.routine_id
    where o.household_id=p_household and o.status='open' and o.role='current' and o.due_date<p_date
      and r.archived_at is null and r.paused_at is null
      and (coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id) is null
        or coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id)=p_recipient) limit 1001
  ) items;
  select count(*) into v_meals from (
    select id from public.meal_plan_entries where household_id=p_household and date=p_date
      and slot is not null and removed_at is null limit 1001
  ) items;
  select count(*) into v_renewals from (
    select id from public.nest_renewals where household_id=p_household and not removed and renewal_on=p_date
      and (responsible_id is null or responsible_id=p_recipient) limit 1001
  ) items;
  select count(*) into v_deadlines from (
    select id from public.nest_renewals where household_id=p_household and not removed and renewal_on-notice_days=p_date
      and (responsible_id is null or responsible_id=p_recipient) limit 1001
  ) items;
  return jsonb_build_object('version',1,'householdId',p_household,'recipientId',p_recipient,
    'date',to_char(p_date,'YYYY-MM-DD'),'choresDue',private.nest_summary_count(v_due),
    'choresOverdue',private.nest_summary_count(v_overdue),'mealsPlanned',private.nest_summary_count(v_meals),
    'renewalsDue',private.nest_summary_count(v_renewals),'cancellationDeadlines',private.nest_summary_count(v_deadlines));
end;
$$;
revoke all on function private.nest_daily_summary_content(uuid,uuid,date) from public,anon,authenticated,service_role;
