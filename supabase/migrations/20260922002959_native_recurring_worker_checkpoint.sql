-- GATED service-only scheduling state. Does not register or activate a timer.
create table private.nest_recurring_sweep (
  singleton boolean primary key default true check(singleton),
  cursor jsonb,
  owner uuid,
  expires_at timestamptz
);
insert into private.nest_recurring_sweep(singleton) values(true);
create table private.nest_recurring_runs (
  id uuid primary key,
  budget integer not null check(budget between 1 and 25),
  claim jsonb not null,
  report jsonb,
  completed_at timestamptz
);
revoke all on private.nest_recurring_sweep,private.nest_recurring_runs from public,anon,authenticated,service_role;

create function private.nest_claim_recurring_run(p_run uuid,p_budget integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_state private.nest_recurring_sweep; v_prior private.nest_recurring_runs; v_claim jsonb; v_expires timestamptz;
begin
  if p_run is null or p_budget is null or p_budget<1 or p_budget>25 then
    raise exception 'Invalid run' using errcode='22023'; end if;
  select * into strict v_state from private.nest_recurring_sweep where singleton for update;
  select * into v_prior from private.nest_recurring_runs where id=p_run;
  if found then
    if v_prior.budget<>p_budget then raise exception 'Run identity reused' using errcode='22023'; end if;
    if v_prior.report is not null or v_state.owner is distinct from p_run or v_state.expires_at<=clock_timestamp() then
      raise exception 'Run is no longer active' using errcode='55000'; end if;
    return v_prior.claim;
  end if;
  if v_state.owner is not null and v_state.expires_at>clock_timestamp() then
    raise exception 'Worker already running' using errcode='55P03'; end if;
  v_expires:=clock_timestamp()+interval '10 minutes';
  v_claim:=jsonb_build_object('version',1,'runId',p_run,'budget',p_budget,'after',v_state.cursor,'expiresAt',v_expires);
  insert into private.nest_recurring_runs(id,budget,claim) values(p_run,p_budget,v_claim);
  update private.nest_recurring_sweep set owner=p_run,expires_at=v_expires where singleton;
  return v_claim;
end;
$$;
revoke all on function private.nest_claim_recurring_run(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.nest_claim_recurring_run(uuid,integer) to service_role;
create function public.nest_claim_recurring_run(p_run uuid,p_budget integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_claim_recurring_run($1,$2); $$;
revoke all on function public.nest_claim_recurring_run(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.nest_claim_recurring_run(uuid,integer) to service_role;

create function private.nest_validate_recurring_report(p_report jsonb,p_claim jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_after jsonb:=p_report->'after'; v_before jsonb:=p_claim->'after'; v_count integer; v_failed integer;
begin
  if p_report is null or jsonb_typeof(p_report) is distinct from 'object'
    or not p_report ?& array['after','complete','processed','failed','scanFailure']
    or p_report-array['after','complete','processed','failed','scanFailure']<>'{}'::jsonb
    or jsonb_typeof(p_report->'complete') is distinct from 'boolean'
    or jsonb_typeof(p_report->'processed') is distinct from 'number'
    or jsonb_typeof(p_report->'failed') is distinct from 'number' then
    raise exception 'Invalid run report' using errcode='22023'; end if;
  v_count:=(p_report->>'processed')::integer; v_failed:=(p_report->>'failed')::integer;
  if v_count::numeric<>(p_report->>'processed')::numeric or v_failed::numeric<>(p_report->>'failed')::numeric
    or v_count<0 or v_count>(p_claim->>'budget')::integer or v_failed<0 or v_failed>v_count
    or p_report->'scanFailure' not in ('null'::jsonb,'"unavailable"'::jsonb,'"forbidden"'::jsonb,'"conflict"'::jsonb) then
    raise exception 'Invalid run counts or failure' using errcode='22023'; end if;
  if (p_report->>'complete')::boolean then
    if v_after<>'null'::jsonb or p_report->'scanFailure'<>'null'::jsonb then
      raise exception 'Incomplete sweep' using errcode='22023'; end if;
  else
    if v_count=0 and v_after is distinct from v_before then
      raise exception 'Unprocessed cursor changed' using errcode='22023'; end if;
    if v_after<>'null'::jsonb then
      if jsonb_typeof(v_after) is distinct from 'object' or v_after-array['dueOn','householdId','ruleId']<>'{}'::jsonb then
        raise exception 'Invalid cursor' using errcode='22023'; end if;
      perform private.nest_fixed_job_input(v_after||jsonb_build_object('revision',v_after->'ruleId'));
    end if;
    if v_count>0 and (v_after='null'::jsonb or (v_before<>'null'::jsonb and
      (v_after->>'dueOn',v_after->>'householdId',v_after->>'ruleId')<=
      (v_before->>'dueOn',v_before->>'householdId',v_before->>'ruleId'))) then
      raise exception 'Cursor did not advance' using errcode='22023'; end if;
  end if;
end;
$$;
revoke all on function private.nest_validate_recurring_report(jsonb,jsonb) from public,anon,authenticated,service_role;

create function private.nest_finish_recurring_run(p_run uuid,p_report jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_state private.nest_recurring_sweep; v_run private.nest_recurring_runs;
begin
  select * into strict v_state from private.nest_recurring_sweep where singleton for update;
  select * into v_run from private.nest_recurring_runs where id=p_run;
  if not found then raise exception 'Unknown run' using errcode='22023'; end if;
  perform private.nest_validate_recurring_report(p_report,v_run.claim);
  if v_run.report is not null then
    if v_run.report is distinct from p_report then raise exception 'Run report changed' using errcode='22023'; end if;
    return jsonb_build_object('version',1,'runId',p_run,'report',v_run.report);
  end if;
  if v_state.owner is distinct from p_run or v_state.expires_at<=clock_timestamp() then
    raise exception 'Run lease expired' using errcode='55000'; end if;
  update private.nest_recurring_runs set report=p_report,completed_at=clock_timestamp() where id=p_run;
  update private.nest_recurring_sweep set cursor=nullif(p_report->'after','null'::jsonb),owner=null,expires_at=null where singleton;
  return jsonb_build_object('version',1,'runId',p_run,'report',p_report);
end;
$$;
revoke all on function private.nest_finish_recurring_run(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_finish_recurring_run(uuid,jsonb) to service_role;
create function public.nest_finish_recurring_run(p_run uuid,p_report jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_finish_recurring_run($1,$2); $$;
revoke all on function public.nest_finish_recurring_run(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_finish_recurring_run(uuid,jsonb) to service_role;
