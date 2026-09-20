-- GATED additive candidate. No delivery, scheduling, push enrollment or legacy-data changes.
do $$ begin
  if to_regclass('public.household_members') is null or to_regnamespace('private') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Nest requires the existing tenancy baseline' using errcode='55000';
  end if;
end $$;
create table public.nest_notification_preferences (
  actor_id uuid not null, household_id uuid not null, revision bigint not null check(revision>0),
  daily_summary_enabled boolean not null,
  daily_summary_time text not null check(daily_summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  item_reminders_enabled boolean not null, updated_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id)
);
comment on column public.nest_notification_preferences.daily_summary_time is
  'Daily summary wall-clock time in Europe/Zurich. Missing record is unconfigured, not consent.';
create table public.nest_notification_preference_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  result_revision bigint not null check(result_revision>0), created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_notification_preferences enable row level security;
alter table public.nest_notification_preference_receipts enable row level security;
revoke all on public.nest_notification_preferences,public.nest_notification_preference_receipts from public,anon,authenticated;
grant select on public.nest_notification_preferences,public.nest_notification_preference_receipts to authenticated;
create policy own_notification_preferences on public.nest_notification_preferences for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_notification_preferences.household_id));
create policy own_notification_preference_receipts on public.nest_notification_preference_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_notification_preference_receipts.household_id));

create function private.nest_save_notification_preferences(
  p_household uuid,p_operation uuid,p_expected bigint,p_daily_enabled boolean,p_daily_time text,p_items_enabled boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_notification_preference_receipts;
  v_revision bigint; v_result bigint;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_expected is null or p_expected<0 or p_daily_enabled is null
    or p_items_enabled is null or p_daily_time is null or p_daily_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid notification preferences' using errcode='22023';
  end if;
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,'dailySummaryEnabled',p_daily_enabled,
    'dailySummaryTime',p_daily_time,'itemRemindersEnabled',p_items_enabled)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest-notification-preferences:'||p_household::text||':'||v_actor::text,0));
  select * into v_prior from public.nest_notification_preference_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Notification operation changed' using errcode='22023'; end if;
    v_result:=v_prior.result_revision;
  else
    select revision into v_revision from public.nest_notification_preferences
      where actor_id=v_actor and household_id=p_household for update;
    if coalesce(v_revision,0)<>p_expected or p_expected=9223372036854775807 then
      raise exception 'Notification preferences changed' using errcode='40001';
    end if;
    v_result:=p_expected+1;
    insert into public.nest_notification_preferences(actor_id,household_id,revision,daily_summary_enabled,daily_summary_time,item_reminders_enabled)
      values(v_actor,p_household,v_result,p_daily_enabled,p_daily_time,p_items_enabled)
      on conflict(actor_id,household_id) do update set revision=excluded.revision,
        daily_summary_enabled=excluded.daily_summary_enabled,daily_summary_time=excluded.daily_summary_time,
        item_reminders_enabled=excluded.item_reminders_enabled,updated_at=clock_timestamp();
    insert into public.nest_notification_preference_receipts(actor_id,household_id,operation_id,request_hash,result_revision)
      values(v_actor,p_household,p_operation,v_hash,v_result);
  end if;
  return jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,'revision',v_result::text);
end;
$$;
revoke all on function private.nest_save_notification_preferences(uuid,uuid,bigint,boolean,text,boolean) from public,anon,authenticated;
grant execute on function private.nest_save_notification_preferences(uuid,uuid,bigint,boolean,text,boolean) to authenticated;
create function public.nest_save_notification_preferences(
  p_household uuid,p_operation uuid,p_expected bigint,p_daily_enabled boolean,p_daily_time text,p_items_enabled boolean
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_notification_preferences($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_save_notification_preferences(uuid,uuid,bigint,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.nest_save_notification_preferences(uuid,uuid,bigint,boolean,text,boolean) to authenticated;
