-- GATED recurring scheduling primitives. No hosted job or push delivery is enabled.
-- Settings follow cycles of the reviewed rule revision. Completed cycles invalidate pending work.
create function private.nest_recurring_reminder_due(p_item public.nest_recurring_rules,p_reminder public.nest_recurring_reminders,p_execution private.nest_recurring_execution)
returns timestamptz language plpgsql stable set search_path='' as $$
declare v_date date; v_due timestamptz;
begin
  if p_item.id is null or p_reminder.rule_id is null
    or p_item.household_id<>p_reminder.household_id or p_item.id<>p_reminder.rule_id
    or p_item.status<>'active' or p_item.revision<>p_reminder.reviewed_rule_revision
    or p_execution.household_id is distinct from p_item.household_id
    or p_execution.rule_id is distinct from p_item.id
    or p_execution.next_due_on is null
    or p_execution.next_due_on<(p_item.configuration->>'startDate')::date
    or p_execution.covered_through>=p_execution.next_due_on
    or not (p_reminder.settings->>'enabled')::boolean then return null; end if;
  v_date:=p_execution.next_due_on-(p_reminder.settings->>'daysBefore')::integer;
  if v_date not between date '0001-01-01' and date '9999-12-31' then return null; end if;
  -- PostgreSQL shifts Zurich DST gaps forward and resolves overlaps to standard time.
  v_due:=(v_date+(p_reminder.settings->>'localTime')::time) at time zone 'Europe/Zurich';
  -- The supported range is local civil dates. PostgreSQL can retain the UTC
  -- instant just before year 1 produced by Zurich's historical offset.
  -- Outbox instants stay internal; delivery separately rejects expired work.
  return v_due;
end;
$$;
revoke all on function private.nest_recurring_reminder_due(public.nest_recurring_rules,public.nest_recurring_reminders,private.nest_recurring_execution) from public,anon,authenticated,service_role;

-- Internal candidate read; scheduler supplies one indexed item identity. Delivery must recheck these conditions when claiming/sending.
create function private.nest_recurring_reminder_candidates(p_from timestamptz,p_until timestamptz,p_household uuid,p_item uuid)
returns table(household_id uuid,rule_id uuid,rule_revision uuid,schedule_revision uuid,recipient_id uuid,due_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '1 day' then
    raise exception 'Invalid reminder window' using errcode='22023'; end if;
  return query
    select r.household_id,r.id,s.reviewed_rule_revision,s.revision,m.user_id,d.due_at
    from public.nest_recurring_rules r
    join public.nest_recurring_reminders s on s.household_id=r.household_id and s.rule_id=r.id
    join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id
    cross join lateral (select private.nest_recurring_reminder_due(r,s,e) as due_at) d
    join public.household_members m on m.household_id=r.household_id
      and s.settings->'recipientIds' @> jsonb_build_array(m.user_id)
    join public.nest_notification_preferences p on p.household_id=m.household_id and p.actor_id=m.user_id
      and p.item_reminders_enabled
    where r.household_id=p_household
      and r.id=p_item and d.due_at>=p_from and d.due_at<p_until
    order by d.due_at,r.household_id,r.id,m.user_id;
end;
$$;
revoke all on function private.nest_recurring_reminder_candidates(timestamptz,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;

create table private.nest_recurring_reminder_outbox (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  rule_id uuid not null, rule_revision uuid not null, schedule_revision uuid not null,
  recipient_id uuid not null, due_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','cancelled','sent')),
  created_at timestamptz not null default clock_timestamp(),
  unique(household_id,rule_id,rule_revision,schedule_revision,recipient_id,due_at)
);
alter table private.nest_recurring_reminder_outbox enable row level security;
revoke all on private.nest_recurring_reminder_outbox from public,anon,authenticated,service_role;
create index nest_recurring_reminder_outbox_pending on private.nest_recurring_reminder_outbox(due_at,id) where state='pending';

-- A window cursor advances over source rows, including muted/not-due rows.
-- A zero insert count does not mean the sweep is complete. Callers must keep
-- visiting the window; wrapping revisits edits and newly inserted earlier keys.
create table private.nest_recurring_reminder_scans (
  window_start timestamptz not null, window_end timestamptz not null,
  after_household uuid not null default '00000000-0000-0000-0000-000000000000',
  after_item uuid not null default '00000000-0000-0000-0000-000000000000',
  primary key(window_start,window_end)
);
alter table private.nest_recurring_reminder_scans enable row level security;
revoke all on private.nest_recurring_reminder_scans from public,anon,authenticated,service_role;

create function private.nest_materialize_recurring_reminders(p_from timestamptz,p_until timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count bigint:=0; v_added bigint; v_scanned integer:=0;
  v_cursor private.nest_recurring_reminder_scans; v_item record;
begin
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until)
    or p_until<=p_from or p_until-p_from>interval '1 day' then
    raise exception 'Invalid reminder window' using errcode='22023'; end if;
  insert into private.nest_recurring_reminder_scans(window_start,window_end)
    values(p_from,p_until) on conflict do nothing;
  select * into strict v_cursor from private.nest_recurring_reminder_scans
    where window_start=p_from and window_end=p_until for update;
  for v_item in select household_id,rule_id from public.nest_recurring_reminders
    where (household_id,rule_id)>(v_cursor.after_household,v_cursor.after_item)
    order by household_id,rule_id limit 250 loop
    v_scanned:=v_scanned+1;
    insert into private.nest_recurring_reminder_outbox(household_id,rule_id,rule_revision,schedule_revision,recipient_id,due_at)
      select c.household_id,c.rule_id,c.rule_revision,c.schedule_revision,c.recipient_id,c.due_at
      from private.nest_recurring_reminder_candidates(p_from,p_until,v_item.household_id,v_item.rule_id) c
      on conflict(household_id,rule_id,rule_revision,schedule_revision,recipient_id,due_at)
        do update set state='pending' where private.nest_recurring_reminder_outbox.state='cancelled';
    get diagnostics v_added=row_count;
    v_count:=v_count+v_added;
    v_cursor.after_household:=v_item.household_id; v_cursor.after_item:=v_item.rule_id;
  end loop;
  if v_scanned<250 then
    v_cursor.after_household:='00000000-0000-0000-0000-000000000000';
    v_cursor.after_item:='00000000-0000-0000-0000-000000000000';
  end if;
  update private.nest_recurring_reminder_scans
    set after_household=v_cursor.after_household,after_item=v_cursor.after_item
    where window_start=p_from and window_end=p_until;
  return jsonb_build_object('scanned',v_scanned,'inserted',v_count,'wrapped',v_scanned<250);
end;
$$;
revoke all on function private.nest_materialize_recurring_reminders(timestamptz,timestamptz) from public,anon,authenticated,service_role;

create function private.nest_recurring_reminder_current(p_row private.nest_recurring_reminder_outbox)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.nest_recurring_rules r
    join public.nest_recurring_reminders s on s.household_id=r.household_id and s.rule_id=r.id
    join private.nest_recurring_execution e on e.household_id=r.household_id and e.rule_id=r.id
    join public.household_members m on m.household_id=r.household_id and m.user_id=p_row.recipient_id
    join public.nest_notification_preferences p on p.household_id=m.household_id and p.actor_id=m.user_id
    where r.household_id=p_row.household_id and r.id=p_row.rule_id
      and s.reviewed_rule_revision=p_row.rule_revision and s.revision=p_row.schedule_revision
      and s.settings->'recipientIds' @> jsonb_build_array(m.user_id) and p.item_reminders_enabled
      and private.nest_recurring_reminder_due(r,s,e)=p_row.due_at
  );
$$;
revoke all on function private.nest_recurring_reminder_current(private.nest_recurring_reminder_outbox) from public,anon,authenticated,service_role;
create table private.nest_recurring_reminder_cancel_scan (
  singleton boolean primary key default true check(singleton),
  after_due timestamptz not null default '-infinity',
  after_id uuid not null default '00000000-0000-0000-0000-000000000000'
);
alter table private.nest_recurring_reminder_cancel_scan enable row level security;
revoke all on private.nest_recurring_reminder_cancel_scan from public,anon,authenticated,service_role;
insert into private.nest_recurring_reminder_cancel_scan(singleton) values(true);

-- Inspect at most 500 pending rows, not 500 matches after an unbounded filter.
-- As with materialization, zero mutations does not mean the sweep is complete.
create function private.nest_cancel_obsolete_recurring_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count bigint:=0; v_scanned integer:=0; v_changed bigint;
  v_cursor private.nest_recurring_reminder_cancel_scan;
  v_row private.nest_recurring_reminder_outbox;
begin
  select * into strict v_cursor from private.nest_recurring_reminder_cancel_scan
    where singleton for update;
  for v_row in select * from private.nest_recurring_reminder_outbox
    where state='pending' and (due_at,id)>(v_cursor.after_due,v_cursor.after_id)
    order by due_at,id limit 500 for update loop
    v_scanned:=v_scanned+1;
    update private.nest_recurring_reminder_outbox set state='cancelled'
      where id=v_row.id and state='pending' and not private.nest_recurring_reminder_current(v_row);
    get diagnostics v_changed=row_count;
    v_count:=v_count+v_changed;
    v_cursor.after_due:=v_row.due_at; v_cursor.after_id:=v_row.id;
  end loop;
  if v_scanned<500 then
    v_cursor.after_due:='-infinity';
    v_cursor.after_id:='00000000-0000-0000-0000-000000000000';
  end if;
  update private.nest_recurring_reminder_cancel_scan
    set after_due=v_cursor.after_due,after_id=v_cursor.after_id where singleton;
  return jsonb_build_object('scanned',v_scanned,'cancelled',v_count,'wrapped',v_scanned<500);
end;
$$;
revoke all on function private.nest_cancel_obsolete_recurring_reminders() from public,anon,authenticated,service_role;
