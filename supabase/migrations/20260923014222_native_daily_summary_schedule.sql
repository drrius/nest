-- GATED daily-summary scheduling primitive; no scheduler, content read or delivery activated.
-- The day identity deliberately excludes preference revision: editing the chosen
-- time cannot create a second summary once that day's delivery has begun.
create table private.nest_daily_summary_outbox (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  recipient_id uuid not null,
  summary_date date not null check(isfinite(summary_date) and summary_date between date '0001-01-01' and date '9999-12-31'),
  preference_revision bigint not null check(preference_revision>0),
  due_at timestamptz not null check(isfinite(due_at) and due_at>=timestamptz '0001-01-01 00:00:00+00' and due_at<timestamptz '10000-01-01 00:00:00+00'),
  state text not null default 'pending' check(state in ('pending','cancelled','started')),
  unique(household_id,recipient_id,summary_date)
);
alter table private.nest_daily_summary_outbox enable row level security;
revoke all on private.nest_daily_summary_outbox from public,anon,authenticated,service_role;
create index nest_daily_summary_due on private.nest_daily_summary_outbox(due_at,id) where state='pending';

-- One indexed member/day at a time. A later bounded scanner will call this.
-- PostgreSQL moves a nonexistent Zurich wall time forward and resolves a repeated
-- wall time to standard time, producing exactly one instant on each civil day.
create function private.nest_schedule_daily_summary(p_household uuid,p_recipient uuid,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_profile public.nest_notification_preferences; v_member boolean; v_id uuid; v_due timestamptz;
begin
  if p_household is null or p_recipient is null or p_date is null or not isfinite(p_date)
    or p_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Invalid summary identity' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest-notification-preferences:'||p_household::text||':'||p_recipient::text,0));
  perform 1 from public.household_members where household_id=p_household and user_id=p_recipient for key share;
  v_member:=found;
  select * into v_profile from public.nest_notification_preferences
    where household_id=p_household and actor_id=p_recipient for update;
  if not v_member or v_profile.actor_id is null or not v_profile.daily_summary_enabled then
    update private.nest_daily_summary_outbox set state='cancelled'
      where household_id=p_household and recipient_id=p_recipient and summary_date=p_date and state='pending';
    return null;
  end if;
  v_due:=(p_date+v_profile.daily_summary_time::time) at time zone 'Europe/Zurich';
  if v_due<timestamptz '0001-01-01 00:00:00+00' or v_due>=timestamptz '10000-01-01 00:00:00+00' then
    raise exception 'Unsupported summary instant' using errcode='22023'; end if;
  insert into private.nest_daily_summary_outbox as existing
    (household_id,recipient_id,summary_date,preference_revision,due_at)
    values(p_household,p_recipient,p_date,v_profile.revision,
      v_due)
    on conflict(household_id,recipient_id,summary_date) do update
      set preference_revision=excluded.preference_revision,due_at=excluded.due_at,state='pending'
      where existing.state in ('pending','cancelled')
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.nest_schedule_daily_summary(uuid,uuid,date) from public,anon,authenticated,service_role;
