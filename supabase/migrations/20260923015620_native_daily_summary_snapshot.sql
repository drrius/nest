-- GATED atomic content snapshot. This never releases a device token or sends push.
create table private.nest_daily_summary_snapshots (
  outbox_id uuid primary key references private.nest_daily_summary_outbox(id),
  content jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.nest_daily_summary_snapshots enable row level security;
revoke all on private.nest_daily_summary_snapshots from public,anon,authenticated,service_role;
create trigger nest_daily_summary_snapshot_immutable before update or delete on private.nest_daily_summary_snapshots
  for each row execute function private.reject_financial_history_change();

create function private.nest_start_daily_summary(p_outbox uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.nest_daily_summary_outbox; v_profile public.nest_notification_preferences;
  v_now timestamptz; v_content jsonb;
begin
  -- Look up identity without a row lock, then follow scheduling's preference →
  -- member → profile → outbox lock order. No external request holds these locks.
  select * into v_row from private.nest_daily_summary_outbox where id=p_outbox;
  if v_row.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest-notification-preferences:'||v_row.household_id::text||':'||v_row.recipient_id::text,0));
  perform 1 from public.household_members where household_id=v_row.household_id and user_id=v_row.recipient_id for key share;
  if not found then return null; end if;
  select * into v_profile from public.nest_notification_preferences
    where household_id=v_row.household_id and actor_id=v_row.recipient_id for share;
  if v_profile.actor_id is null or not v_profile.daily_summary_enabled then return null; end if;
  select * into strict v_row from private.nest_daily_summary_outbox where id=p_outbox for update;
  v_now:=clock_timestamp();
  if v_row.summary_date<>(v_now at time zone 'Europe/Zurich')::date then return null; end if;
  if v_row.state='started' then
    select content into strict v_content from private.nest_daily_summary_snapshots where outbox_id=p_outbox;
    return jsonb_build_object('version',1,'summaryId',p_outbox,'summary',v_content);
  end if;
  if v_row.state<>'pending' or v_row.preference_revision<>v_profile.revision
    or v_row.due_at>v_now
    or v_row.due_at is distinct from ((v_row.summary_date+v_profile.daily_summary_time::time) at time zone 'Europe/Zurich') then
    return null;
  end if;
  v_content:=private.nest_daily_summary_content(v_row.household_id,v_row.recipient_id,v_row.summary_date);
  if v_content is null then return null; end if;
  insert into private.nest_daily_summary_snapshots(outbox_id,content) values(p_outbox,v_content);
  update private.nest_daily_summary_outbox set state='started' where id=p_outbox;
  return jsonb_build_object('version',1,'summaryId',p_outbox,'summary',v_content);
end;
$$;
revoke all on function private.nest_start_daily_summary(uuid) from public,anon,authenticated,service_role;
