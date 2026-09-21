-- GATED additive candidate. One server claim per proposal; retries never authorize another generation.
create table private.nest_meal_proposal_jobs (
  proposal_id uuid primary key references private.nest_meal_proposals(proposal_id),
  worker_id uuid not null, deadline_at timestamptz not null,
  finish_hash bytea check(octet_length(finish_hash)=32), result jsonb,
  check((finish_hash is null)=(result is null))
);
alter table private.nest_meal_proposal_jobs enable row level security;
revoke all on private.nest_meal_proposal_jobs from public,anon,authenticated,service_role;

create function private.nest_proposal_owner_result(p private.nest_meal_proposals)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('version',1,'actorId',p.actor_id,'householdId',p.household_id,'proposal',private.nest_meal_proposal_json(p));
$$;
create function private.nest_lock_proposal_worker(p_actor uuid,p_household uuid,p_proposal uuid)
returns private.nest_meal_proposals language plpgsql security invoker set search_path='' as $$
declare v_row private.nest_meal_proposals;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Proposal changed' using errcode='40001'; end if;
  if p_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=p_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_row from private.nest_meal_proposals where proposal_id=p_proposal and actor_id=p_actor and household_id=p_household for update;
  if not found then raise exception 'Proposal changed' using errcode='40001'; end if;
  return v_row;
end;
$$;
create function private.nest_expire_proposal(p private.nest_meal_proposals)
returns private.nest_meal_proposals language plpgsql security invoker set search_path='' as $$
declare v_row private.nest_meal_proposals:=p;
begin
  if p.status='generating' and (p.expires_at<=clock_timestamp() or exists(select 1 from private.nest_meal_proposal_jobs
    where proposal_id=p.proposal_id and deadline_at<=clock_timestamp())) then
    update private.nest_meal_proposals set status='failed',failure='unavailable',entries=null,revision=revision+1
      where proposal_id=p.proposal_id returning * into v_row;
    update private.nest_meal_proposal_jobs set finish_hash=sha256(convert_to('expired','UTF8')),
      result=private.nest_proposal_owner_result(v_row) where proposal_id=p.proposal_id and result is null;
  end if;
  return v_row;
end;
$$;
create function private.nest_claim_meal_proposal(p_actor uuid,p_household uuid,p_proposal uuid,p_worker uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.nest_meal_proposals; v_job private.nest_meal_proposal_jobs;
begin
  if p_worker is null then raise exception 'Invalid proposal worker' using errcode='22023'; end if;
  v_row:=private.nest_expire_proposal(private.nest_lock_proposal_worker(p_actor,p_household,p_proposal));
  if v_row.status<>'generating' or exists(select 1 from private.nest_meal_proposal_jobs where proposal_id=p_proposal) then
    return jsonb_build_object('claimed',false,'worker',null,'envelope',private.nest_proposal_owner_result(v_row));
  end if;
  insert into private.nest_meal_proposal_jobs(proposal_id,worker_id,deadline_at)
    values(p_proposal,p_worker,least(v_row.expires_at,clock_timestamp()+interval '2 minutes')) returning * into v_job;
  return jsonb_build_object('claimed',true,'envelope',private.nest_proposal_owner_result(v_row),
    'worker',jsonb_build_object('id',p_worker,'deadline',floor(extract(epoch from v_job.deadline_at)*1000)::bigint,
      'stateHash',encode(v_row.constraints_hash,'hex')));
end;
$$;
create function private.nest_proposal_outcome(p_outcome jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['workerId','expectedRevision','content','failure']; v_revision bigint;
begin
  if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>4194304
    or not(p_outcome ?& v_keys) or p_outcome-v_keys<>'{}'::jsonb
    or jsonb_typeof(p_outcome->'workerId') is distinct from 'string'
    or p_outcome->>'workerId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_outcome->'expectedRevision') is distinct from 'string'
    or p_outcome->>'expectedRevision' !~ '^[1-9][0-9]{0,18}$' then
    raise exception 'Invalid proposal outcome' using errcode='22023'; end if;
  v_revision:=(p_outcome->>'expectedRevision')::bigint;
  if p_outcome->'failure'='null'::jsonb then
    if jsonb_typeof(p_outcome->'content') is distinct from 'object' then
      raise exception 'Invalid proposal content' using errcode='22023'; end if;
  elsif jsonb_typeof(p_outcome->'failure') is distinct from 'string' or p_outcome->'content'<>'null'::jsonb
    or p_outcome->>'failure' not in ('unavailable','constraints_changed','incomplete_preferences','no_suitable_meals') then
    raise exception 'Invalid proposal failure' using errcode='22023';
  end if;
exception when numeric_value_out_of_range then raise exception 'Invalid proposal outcome' using errcode='22023';
end;
$$;
create function private.nest_validate_proposal_completion(p private.nest_meal_proposals,p_content jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare v_context jsonb;
begin
  perform 1 from public.household_members where household_id=p.household_id order by user_id for share nowait;
  perform 1 from public.nest_food_profiles where household_id=p.household_id order by actor_id for share nowait;
  perform 1 from public.nest_cooking_preferences where household_id=p.household_id for share nowait;
  v_context:=private.nest_meal_planning_context(p.actor_id,p.household_id);
  if decode(v_context->>'stateHash','hex')<>p.constraints_hash then return 'constraints_changed'; end if;
  perform private.nest_proposal_content(p,p_content,v_context);
  return null;
exception when serialization_failure or lock_not_available or deadlock_detected or object_not_in_prerequisite_state then
  return 'constraints_changed';
end;
$$;
create function private.nest_finish_meal_proposal(p_actor uuid,p_household uuid,p_proposal uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.nest_meal_proposals; v_job private.nest_meal_proposal_jobs; v_hash bytea; v_failure text; v_result jsonb;
begin
  v_row:=private.nest_lock_proposal_worker(p_actor,p_household,p_proposal);
  perform private.nest_proposal_outcome(p_outcome);
  select * into v_job from private.nest_meal_proposal_jobs where proposal_id=p_proposal;
  if not found or v_job.worker_id<>(p_outcome->>'workerId')::uuid then raise exception 'Proposal worker changed' using errcode='40001'; end if;
  v_hash:=sha256(convert_to(p_outcome::text,'UTF8'));
  if v_job.result is not null then
    if v_job.finish_hash<>v_hash then raise exception 'Proposal result changed' using errcode='40001'; end if;
    return v_job.result;
  end if;
  if v_row.status<>'generating' or v_row.revision<>(p_outcome->>'expectedRevision')::bigint then
    raise exception 'Proposal changed' using errcode='40001'; end if;
  v_failure:=p_outcome->>'failure';
  if v_failure is null then v_failure:=private.nest_validate_proposal_completion(v_row,p_outcome->'content'); end if;
  -- Recheck after all locks/validation: a blocked worker cannot publish beyond its deadline.
  if clock_timestamp()>=v_job.deadline_at or clock_timestamp()>=v_row.expires_at then v_failure:='unavailable'; end if;
  update private.nest_meal_proposals set status=case when v_failure is null then 'ready' else 'failed' end,
    entries=case when v_failure is null then p_outcome#>'{content,entries}' else null end,
    failure=v_failure,revision=revision+1 where proposal_id=p_proposal returning * into v_row;
  v_result:=private.nest_proposal_owner_result(v_row);
  update private.nest_meal_proposal_jobs set finish_hash=v_hash,result=v_result where proposal_id=p_proposal;
  return v_result;
end;
$$;
create function private.nest_recover_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return private.nest_proposal_owner_result(private.nest_expire_proposal(private.nest_lock_proposal_worker(auth.uid(),p_household,p_proposal)));
end;
$$;
revoke all on function private.nest_proposal_owner_result(private.nest_meal_proposals),private.nest_lock_proposal_worker(uuid,uuid,uuid),
  private.nest_expire_proposal(private.nest_meal_proposals),private.nest_proposal_outcome(jsonb),
  private.nest_validate_proposal_completion(private.nest_meal_proposals,jsonb),private.nest_claim_meal_proposal(uuid,uuid,uuid,uuid),
  private.nest_finish_meal_proposal(uuid,uuid,uuid,jsonb),private.nest_recover_meal_proposal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_claim_meal_proposal(uuid,uuid,uuid,uuid),private.nest_finish_meal_proposal(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function private.nest_recover_meal_proposal(uuid,uuid) to authenticated;
create function public.nest_claim_meal_proposal(p_actor uuid,p_household uuid,p_proposal uuid,p_worker uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_claim_meal_proposal($1,$2,$3,$4); $$;
create function public.nest_finish_meal_proposal(p_actor uuid,p_household uuid,p_proposal uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_finish_meal_proposal($1,$2,$3,$4); $$;
create function public.nest_recover_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_recover_meal_proposal($1,$2); $$;
revoke all on function public.nest_claim_meal_proposal(uuid,uuid,uuid,uuid),public.nest_finish_meal_proposal(uuid,uuid,uuid,jsonb),
  public.nest_recover_meal_proposal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_claim_meal_proposal(uuid,uuid,uuid,uuid),public.nest_finish_meal_proposal(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.nest_recover_meal_proposal(uuid,uuid) to authenticated;
