-- GATED scheduling primitive. No jobs, outbox insertion or delivery is activated.
-- PostgreSQL resolves Zurich DST gaps forward and overlaps to standard time.
create function private.nest_renewal_reminder_due(p_renewal public.nest_renewals,p_reminder public.nest_renewal_reminders)
returns timestamptz language plpgsql stable set search_path='' as $$
declare v_date date; v_days integer;
begin
  if p_renewal.id is null or p_reminder.renewal_id is null
    or p_renewal.household_id<>p_reminder.household_id or p_renewal.id<>p_reminder.renewal_id
    or p_renewal.removed or p_renewal.revision<>p_reminder.reviewed_renewal_revision
    or not (p_reminder.delivery->>'enabled')::boolean then return null; end if;
  v_days:=(p_reminder.delivery->>'daysBefore')::integer;
  if p_reminder.anchor='cancellation' then v_days:=v_days+p_renewal.notice_days; end if;
  v_date:=p_renewal.renewal_on-v_days;
  if v_date<date '0001-01-01' then return null; end if;
  return (v_date+(p_reminder.delivery->>'localTime')::time) at time zone 'Europe/Zurich';
end;
$$;
revoke all on function private.nest_renewal_reminder_due(public.nest_renewals,public.nest_renewal_reminders) from public,anon,authenticated,service_role;

-- Internal candidate read; scheduler supplies one indexed item identity. Delivery must recheck these conditions when claiming/sending.
create function private.nest_renewal_reminder_candidates(p_from timestamptz,p_until timestamptz,p_household uuid,p_renewal uuid)
returns table(household_id uuid,renewal_id uuid,item_revision uuid,schedule_revision uuid,recipient_id uuid,due_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '1 day' then
    raise exception 'Invalid reminder window' using errcode='22023'; end if;
  return query
    select r.household_id,r.id,r.revision,s.revision,m.user_id,d.due_at
    from public.nest_renewals r
    join public.nest_renewal_reminders s on s.household_id=r.household_id and s.renewal_id=r.id
    cross join lateral (select private.nest_renewal_reminder_due(r,s) as due_at) d
    join public.household_members m on m.household_id=r.household_id
      and s.delivery->'recipientIds' @> jsonb_build_array(m.user_id)
    join public.nest_notification_preferences p on p.household_id=m.household_id and p.actor_id=m.user_id
      and p.item_reminders_enabled
    where r.household_id=p_household
      and r.id=p_renewal and d.due_at>=p_from and d.due_at<p_until
    order by d.due_at,r.household_id,r.id,m.user_id;
end;
$$;
revoke all on function private.nest_renewal_reminder_candidates(timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;

create table private.nest_renewal_reminder_outbox (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  renewal_id uuid not null, item_revision uuid not null, schedule_revision uuid not null,
  recipient_id uuid not null, due_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','cancelled','sent')),
  created_at timestamptz not null default clock_timestamp(),
  unique(household_id,renewal_id,item_revision,schedule_revision,recipient_id,due_at)
);
alter table private.nest_renewal_reminder_outbox enable row level security;
revoke all on private.nest_renewal_reminder_outbox from public,anon,authenticated,service_role;
create index nest_renewal_reminder_outbox_pending on private.nest_renewal_reminder_outbox(due_at,id) where state='pending';

-- A window cursor advances over source rows, including muted/not-due rows.
-- A zero insert count does not mean the sweep is complete. Callers must keep
-- visiting the window; wrapping revisits edits and newly inserted earlier keys.
create table private.nest_renewal_reminder_scans (
  window_start timestamptz not null, window_end timestamptz not null,
  after_household uuid not null default '00000000-0000-0000-0000-000000000000',
  after_renewal uuid not null default '00000000-0000-0000-0000-000000000000',
  primary key(window_start,window_end)
);
alter table private.nest_renewal_reminder_scans enable row level security;
revoke all on private.nest_renewal_reminder_scans from public,anon,authenticated,service_role;

create function private.nest_materialize_renewal_reminders(p_from timestamptz,p_until timestamptz)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_count bigint:=0; v_added bigint; v_scanned integer:=0;
  v_cursor private.nest_renewal_reminder_scans; v_item record;
begin
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '1 day' then
    raise exception 'Invalid reminder window' using errcode='22023'; end if;
  insert into private.nest_renewal_reminder_scans(window_start,window_end)
    values(p_from,p_until) on conflict do nothing;
  select * into strict v_cursor from private.nest_renewal_reminder_scans
    where window_start=p_from and window_end=p_until for update;
  for v_item in select household_id,renewal_id from public.nest_renewal_reminders
    where (household_id,renewal_id)>(v_cursor.after_household,v_cursor.after_renewal)
    order by household_id,renewal_id limit 250 loop
    v_scanned:=v_scanned+1;
    insert into private.nest_renewal_reminder_outbox(household_id,renewal_id,item_revision,schedule_revision,recipient_id,due_at)
      select c.household_id,c.renewal_id,c.item_revision,c.schedule_revision,c.recipient_id,c.due_at
      from private.nest_renewal_reminder_candidates(p_from,p_until,v_item.household_id,v_item.renewal_id) c
      on conflict(household_id,renewal_id,item_revision,schedule_revision,recipient_id,due_at)
        do update set state='pending' where private.nest_renewal_reminder_outbox.state='cancelled';
    get diagnostics v_added=row_count;
    v_count:=v_count+v_added;
    v_cursor.after_household:=v_item.household_id; v_cursor.after_renewal:=v_item.renewal_id;
  end loop;
  if v_scanned<250 then
    v_cursor.after_household:='00000000-0000-0000-0000-000000000000';
    v_cursor.after_renewal:='00000000-0000-0000-0000-000000000000';
  end if;
  update private.nest_renewal_reminder_scans
    set after_household=v_cursor.after_household,after_renewal=v_cursor.after_renewal
    where window_start=p_from and window_end=p_until;
  return v_count;
end;
$$;
revoke all on function private.nest_materialize_renewal_reminders(timestamptz,timestamptz) from public,anon,authenticated,service_role;

create function private.nest_renewal_reminder_current(p_row private.nest_renewal_reminder_outbox)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.nest_renewals r
    join public.nest_renewal_reminders s on s.household_id=r.household_id and s.renewal_id=r.id
    join public.household_members m on m.household_id=r.household_id and m.user_id=p_row.recipient_id
    join public.nest_notification_preferences p on p.household_id=m.household_id and p.actor_id=m.user_id
    where r.household_id=p_row.household_id and r.id=p_row.renewal_id
      and r.revision=p_row.item_revision and s.revision=p_row.schedule_revision
      and s.delivery->'recipientIds' @> jsonb_build_array(m.user_id) and p.item_reminders_enabled
      and private.nest_renewal_reminder_due(r,s)=p_row.due_at
  );
$$;
revoke all on function private.nest_renewal_reminder_current(private.nest_renewal_reminder_outbox) from public,anon,authenticated,service_role;
create function private.nest_cancel_obsolete_renewal_reminders()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_count bigint;
begin
  update private.nest_renewal_reminder_outbox o set state='cancelled'
    where o.id in (select candidate.id from private.nest_renewal_reminder_outbox candidate
      where candidate.state='pending' and not private.nest_renewal_reminder_current(candidate)
      order by candidate.due_at,candidate.id limit 500 for update skip locked);
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function private.nest_cancel_obsolete_renewal_reminders() from public,anon,authenticated,service_role;
