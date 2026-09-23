-- GATED bounded source traversal; no Cron registration, public RPC or delivery.
create table private.nest_daily_summary_scans (
  summary_date date primary key check(isfinite(summary_date) and summary_date between date '0001-01-01' and date '9999-12-31'),
  after_actor uuid not null default '00000000-0000-0000-0000-000000000000',
  after_household uuid not null default '00000000-0000-0000-0000-000000000000'
);
alter table private.nest_daily_summary_scans enable row level security;
revoke all on private.nest_daily_summary_scans from public,anon,authenticated,service_role;

create function private.nest_materialize_daily_summaries(p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cursor private.nest_daily_summary_scans; v_profile record;
  v_scanned integer:=0; v_scheduled integer:=0;
begin
  if p_date is null or not isfinite(p_date) or p_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Invalid summary date' using errcode='22023'; end if;
  -- Serialize dates too: each page may lock several preference rows, and cursors
  -- for different dates could otherwise visit those locks in conflicting orders.
  perform pg_advisory_xact_lock(hashtextextended('nest:daily-summary-materialization',0));
  insert into private.nest_daily_summary_scans(summary_date) values(p_date) on conflict do nothing;
  select * into strict v_cursor from private.nest_daily_summary_scans where summary_date=p_date for update;
  -- Scan raw preferences, including muted/removed users. Limit source work rather
  -- than matching output; primary key(actor_id,household_id) supports this cursor.
  for v_profile in select actor_id,household_id from public.nest_notification_preferences
    where (actor_id,household_id)>(v_cursor.after_actor,v_cursor.after_household)
    order by actor_id,household_id limit 250 loop
    v_scanned:=v_scanned+1;
    if private.nest_schedule_daily_summary(v_profile.household_id,v_profile.actor_id,p_date) is not null then
      v_scheduled:=v_scheduled+1;
    end if;
    v_cursor.after_actor:=v_profile.actor_id; v_cursor.after_household:=v_profile.household_id;
  end loop;
  if v_scanned<250 then
    v_cursor.after_actor:='00000000-0000-0000-0000-000000000000';
    v_cursor.after_household:='00000000-0000-0000-0000-000000000000';
  end if;
  update private.nest_daily_summary_scans set after_actor=v_cursor.after_actor,after_household=v_cursor.after_household
    where summary_date=p_date;
  -- scheduled includes unchanged pending identities, never a count of new sends.
  return jsonb_build_object('version',1,'scanned',v_scanned,'scheduled',v_scheduled,'wrapped',v_scanned<250);
end;
$$;
revoke all on function private.nest_materialize_daily_summaries(date) from public,anon,authenticated,service_role;
