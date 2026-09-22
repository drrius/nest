-- GATED service-only primitives. No cron registration, deployment or activation.
create table private.nest_recurring_job_receipts (
  job_id uuid primary key,
  request jsonb not null,
  result jsonb not null,
  worker text not null default 'recurring-scheduler' check(worker='recurring-scheduler'),
  completed_at timestamptz not null default clock_timestamp()
);
revoke all on private.nest_recurring_job_receipts from public,anon,authenticated,service_role;
create trigger nest_recurring_job_receipts_are_append_only before update or delete on private.nest_recurring_job_receipts
  for each row execute function private.reject_financial_history_change();

create function private.nest_fixed_job_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_due date; v_key text;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or not p_input ?& array['householdId','ruleId','revision','dueOn']
    or p_input-array['householdId','ruleId','revision','dueOn']<>'{}'::jsonb then
    raise exception 'Invalid recurring job' using errcode='22023'; end if;
  foreach v_key in array array['householdId','ruleId','revision'] loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string'
      or (p_input->>v_key)::uuid::text is distinct from p_input->>v_key then
      raise exception 'Invalid job identity' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(p_input->'dueOn') is distinct from 'string' then
    raise exception 'Invalid job date' using errcode='22023'; end if;
  v_due:=(p_input->>'dueOn')::date;
  if not isfinite(v_due) or to_char(v_due,'YYYY-MM-DD')<>p_input->>'dueOn'
    or v_due<date '0001-01-01' or v_due>date '9999-12-31' then
    raise exception 'Invalid job date' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_fixed_job_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_execute_fixed_job(p_job uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior private.nest_recurring_job_receipts; v_cycle jsonb; v_result jsonb;
begin
  if p_job is null then raise exception 'Missing job identity' using errcode='22023'; end if;
  perform private.nest_fixed_job_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:fixed-job:'||p_job::text,0));
  select * into v_prior from private.nest_recurring_job_receipts where job_id=p_job;
  if found then
    if v_prior.request is distinct from p_input then raise exception 'Job identity reused' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  v_cycle:=private.nest_post_fixed_cycle((p_input->>'householdId')::uuid,(p_input->>'ruleId')::uuid,
    (p_input->>'revision')::uuid,(p_input->>'dueOn')::date);
  v_result:=jsonb_build_object('version',1,'jobId',p_job,'worker','recurring-scheduler','input',p_input,'receipt',v_cycle);
  insert into private.nest_recurring_job_receipts(job_id,request,result) values(p_job,p_input,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_execute_fixed_job(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_execute_fixed_job(uuid,jsonb) to service_role;
create function public.nest_execute_fixed_job(p_job uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_fixed_job($1,$2);
$$;
revoke all on function public.nest_execute_fixed_job(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_execute_fixed_job(uuid,jsonb) to service_role;

create index nest_recurring_due_cursor on private.nest_recurring_execution(next_due_on,household_id,rule_id) where next_due_on is not null;

create function private.nest_due_fixed_jobs(p_limit integer,p_after jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_today date:=(statement_timestamp() at time zone 'Europe/Zurich')::date;
  v_due date; v_rule uuid; v_house uuid; v_rows jsonb; v_next jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid job limit' using errcode='22023'; end if;
  if p_after is not null then
    if jsonb_typeof(p_after) is distinct from 'object' or not p_after ?& array['dueOn','householdId','ruleId']
      or p_after-array['dueOn','householdId','ruleId']<>'{}'::jsonb then
      raise exception 'Invalid job cursor' using errcode='22023'; end if;
    perform private.nest_fixed_job_input(p_after||jsonb_build_object('revision',p_after->'ruleId'));
    v_due:=(p_after->>'dueOn')::date; v_rule:=(p_after->>'ruleId')::uuid; v_house:=(p_after->>'householdId')::uuid;
  end if;
  select coalesce(jsonb_agg(candidate order by due_on,household_id,rule_id),'[]'::jsonb) into v_rows from (
    select e.next_due_on due_on,r.household_id,r.id rule_id,jsonb_build_object('householdId',r.household_id,
      'ruleId',r.id,'revision',r.revision,'dueOn',to_char(e.next_due_on,'YYYY-MM-DD')) candidate
    from public.nest_recurring_rules r join private.nest_recurring_execution e
      on e.household_id=r.household_id and e.rule_id=r.id
    where r.status='active' and r.configuration->>'mode'='fixed' and e.next_due_on<=v_today
      and e.next_due_on>=(r.configuration->>'startDate')::date
      and (p_after is null or (e.next_due_on,r.household_id,r.id)>(v_due,v_house,v_rule))
    order by e.next_due_on,r.household_id,r.id limit p_limit+1
  ) due;
  if jsonb_array_length(v_rows)>p_limit then
    v_rows:=v_rows-p_limit;
    v_next:=jsonb_build_object('dueOn',v_rows->(p_limit-1)->'dueOn','householdId',v_rows->(p_limit-1)->'householdId','ruleId',v_rows->(p_limit-1)->'ruleId');
  end if;
  return jsonb_build_object('version',1,'today',to_char(v_today,'YYYY-MM-DD'),'after',p_after,'next',v_next,'jobs',v_rows);
end;
$$;
revoke all on function private.nest_due_fixed_jobs(integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_due_fixed_jobs(integer,jsonb) to service_role;
create function public.nest_due_fixed_jobs(p_limit integer,p_after jsonb default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_due_fixed_jobs($1,$2);
$$;
revoke all on function public.nest_due_fixed_jobs(integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_due_fixed_jobs(integer,jsonb) to service_role;
