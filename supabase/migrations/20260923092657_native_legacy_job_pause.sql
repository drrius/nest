-- GATED recovery control; preserves current scheduling until an authorized operator pauses it.
create table private.nest_legacy_job_control (
  job_kind text primary key,
  paused boolean not null default false
);
insert into private.nest_legacy_job_control(job_kind) values
('deliver_due_reminders'),
('deliver_member_digests'),
('ensure_due_occurrences'),
('generate_recurring_drafts_cron'),
('retain_activity_events'),
('retain_purchased_groceries'),
('drain_push_outbox'),
('invoke_push_dispatch');
revoke all on private.nest_legacy_job_control from public,anon,authenticated,service_role;

create function private.nest_require_legacy_job(p_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare v_paused boolean;
begin
  select paused into v_paused from private.nest_legacy_job_control where job_kind=p_kind for share;
  if v_paused is distinct from false then
    raise exception 'Legacy job paused or control unavailable' using errcode='55000';
  end if;
end;
$$;
revoke all on function private.nest_require_legacy_job(text) from public,anon,authenticated,service_role;

create function private.nest_set_legacy_job_paused(p_kind text,p_paused boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_kind is null or p_paused is null then raise exception 'Job and pause state required' using errcode='22023'; end if;
  update private.nest_legacy_job_control set paused=p_paused where job_kind=p_kind;
  if not found then raise exception 'Unknown legacy job' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_set_legacy_job_paused(text,boolean) from public,anon,authenticated,service_role;

-- Audited legacy bodies retained; only the per-job gate is added.
create or replace function private.claim_job(p_schedule_key text,p_job_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  claim public.job_claims%rowtype;
begin
  if p_schedule_key is null
    or length(trim(p_schedule_key)) not between 1 and 300
  then
    raise exception 'schedule key must contain 1 to 300 characters'
      using errcode = '22023';
  end if;
  if p_job_kind not in (
    'deliver_due_reminders',
    'deliver_member_digests',
    'ensure_due_occurrences',
    'generate_recurring_drafts_cron',
    'retain_activity_events',
    'retain_purchased_groceries',
    'drain_push_outbox'
  ) then
    raise exception 'unknown job kind %', p_job_kind
      using errcode = '22023';
  end if;
  if p_schedule_key not like p_job_kind || ':%' then
    raise exception 'schedule key does not match job kind %', p_job_kind
      using errcode = '22023';
  end if;

  perform private.nest_require_legacy_job(p_job_kind);

  insert into public.job_claims (schedule_key, job_kind, status)
  values (p_schedule_key, p_job_kind, 'started')
  on conflict (schedule_key) do nothing
  returning * into claim;

  if found then
    return jsonb_build_object('decision', 'run', 'claim', to_jsonb(claim));
  end if;

  select stored_claim.*
  into claim
  from public.job_claims as stored_claim
  where stored_claim.schedule_key = p_schedule_key
  for update;

  if claim.job_kind <> p_job_kind then
    raise exception 'schedule key was already used for a different job'
      using errcode = '22023';
  end if;

  case claim.status
    when 'succeeded' then
      return jsonb_build_object('decision','already_succeeded','claim',to_jsonb(claim));
    when 'started' then
      return jsonb_build_object('decision','in_progress','claim',to_jsonb(claim));
    when 'failed' then
      update public.job_claims
      set status = 'started',
          attempt_count = attempt_count + 1,
          result = null,
          last_error = null,
          finished_at = null,
          started_at = now()
      where schedule_key = p_schedule_key
      returning * into claim;
      return jsonb_build_object('decision','retry_failed','claim',to_jsonb(claim));
    else
      raise exception 'unknown job claim status %', claim.status
        using errcode = '23514';
  end case;
end;
$$;

create or replace function private.invoke_push_dispatch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text;
  service_key text;
  request_id bigint;
begin
  perform private.nest_require_legacy_job('invoke_push_dispatch');
  select secrets.decrypted_secret
  into dispatch_url
  from vault.decrypted_secrets as secrets
  where secrets.name = 'push_dispatch_url';

  select secrets.decrypted_secret
  into service_key
  from vault.decrypted_secrets as secrets
  where secrets.name in (
    'push_dispatch_secret_key',
    'push_dispatch_service_role_key'
  )
  order by case secrets.name
    when 'push_dispatch_secret_key' then 0
    else 1
  end
  limit 1;

  if dispatch_url is null or btrim(dispatch_url) = '' then
    return null;
  end if;

  if service_key is null or btrim(service_key) = '' then
    return null;
  end if;

  select net.http_post(
    url := dispatch_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key
    ),
    timeout_milliseconds := 15000
  )
  into request_id;

  return request_id;
end;
$$;
