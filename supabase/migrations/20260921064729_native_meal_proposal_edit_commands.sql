-- GATED additive candidate. Begin/read are owner-only; claim/finish are server-only.
create function private.nest_begin_proposal_edit(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_input jsonb; v_hash bytea; v_prior private.nest_meal_proposal_receipts;
  v_proposal private.nest_meal_proposals; v_job private.nest_meal_proposal_edits; v_source jsonb; v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Proposal changed' using errcode='40001'; end if;
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid edit operation' using errcode='22023'; end if;
  v_input:=private.nest_proposal_edit_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:proposal:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('action','edit','input',v_input)::text,'UTF8'));
  select * into v_prior from private.nest_meal_proposal_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Proposal operation changed' using errcode='22023'; end if;
    v_proposal:=private.nest_lock_proposal_edit(v_actor,p_household,p_operation);
    perform private.nest_expire_proposal_edits(v_proposal);
    select * into v_job from private.nest_meal_proposal_edits where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
    return private.nest_proposal_edit_json(v_job);
  end if;
  v_proposal:=private.nest_lock_proposal_worker(v_actor,p_household,(v_input->>'proposalId')::uuid);
  perform private.nest_expire_proposal_edits(v_proposal);
  if v_proposal.status<>'ready' or v_proposal.revision<>(v_input->>'expectedRevision')::bigint then
    raise exception 'Proposal changed' using errcode='40001'; end if;
  perform private.nest_lock_proposal_approval(v_proposal);
  v_source:=private.nest_proposal_edit_selection(v_proposal,v_input);
  if clock_timestamp()>=v_proposal.expires_at then raise exception 'Proposal expired' using errcode='40001'; end if;
  insert into private.nest_meal_proposal_edits(actor_id,household_id,operation_id,proposal_id,requested_revision,command,selected_source,deadline_at)
    values(v_actor,p_household,p_operation,v_proposal.proposal_id,v_proposal.revision,
      v_input||jsonb_build_object('operationId',p_operation),v_source,least(v_proposal.expires_at,clock_timestamp()+interval '2 minutes')) returning * into v_job;
  v_result:=private.nest_proposal_edit_json(v_job);
  insert into private.nest_meal_proposal_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or foreign_key_violation or lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Proposal changed' using errcode='40001';
end;
$$;
create function private.nest_read_proposal_edit(p_household uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_proposal private.nest_meal_proposals; v_job private.nest_meal_proposal_edits;
begin
  v_proposal:=private.nest_lock_proposal_edit(auth.uid(),p_household,p_operation);
  perform private.nest_expire_proposal_edits(v_proposal);
  select * into v_job from private.nest_meal_proposal_edits where actor_id=auth.uid() and household_id=p_household and operation_id=p_operation;
  return private.nest_proposal_edit_json(v_job);
end;
$$;
create function private.nest_claim_proposal_edit(p_actor uuid,p_household uuid,p_operation uuid,p_worker uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_proposal private.nest_meal_proposals; v_job private.nest_meal_proposal_edits;
begin
  if p_worker is null then raise exception 'Invalid edit worker' using errcode='22023'; end if;
  v_proposal:=private.nest_lock_proposal_edit(p_actor,p_household,p_operation);
  perform private.nest_expire_proposal_edits(v_proposal);
  select * into v_job from private.nest_meal_proposal_edits where actor_id=p_actor and household_id=p_household and operation_id=p_operation;
  if v_job.status<>'pending' or v_job.worker_id is not null then
    return jsonb_build_object('claimed',false,'worker',null,'edit',private.nest_proposal_edit_json(v_job),
      'envelope',private.nest_proposal_owner_result(v_proposal),'selection',null);
  end if;
  update private.nest_meal_proposal_edits set worker_id=p_worker
    where actor_id=p_actor and household_id=p_household and operation_id=p_operation returning * into v_job;
  return jsonb_build_object('claimed',true,'edit',private.nest_proposal_edit_json(v_job),
    'envelope',private.nest_proposal_owner_result(v_proposal),'selection',v_job.selected_source,
    'worker',jsonb_build_object('id',p_worker,'deadline',floor(extract(epoch from v_job.deadline_at)*1000)::bigint,
      'stateHash',encode(v_proposal.constraints_hash,'hex')));
end;
$$;
create function private.nest_finish_proposal_edit(p_actor uuid,p_household uuid,p_operation uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_proposal private.nest_meal_proposals; v_job private.nest_meal_proposal_edits; v_hash bytea; v_failure text;
  v_receipt jsonb; v_index integer;
begin
  v_proposal:=private.nest_lock_proposal_edit(p_actor,p_household,p_operation);
  perform private.nest_proposal_edit_outcome(p_outcome);
  select * into v_job from private.nest_meal_proposal_edits where actor_id=p_actor and household_id=p_household and operation_id=p_operation;
  if v_job.worker_id is null or v_job.worker_id<>(p_outcome->>'workerId')::uuid then
    raise exception 'Edit worker changed' using errcode='40001'; end if;
  v_hash:=sha256(convert_to(p_outcome::text,'UTF8'));
  if v_job.status<>'pending' then
    if v_job.finish_hash<>v_hash then raise exception 'Edit result changed' using errcode='40001'; end if;
    return private.nest_proposal_edit_json(v_job);
  end if;
  v_failure:=p_outcome->>'failure';
  if v_failure is null then v_failure:=private.nest_validate_proposal_edit(v_proposal,v_job,p_outcome->'entry'); end if;
  if clock_timestamp()>=v_job.deadline_at or clock_timestamp()>=v_proposal.expires_at then v_failure:='unavailable'; end if;
  if v_failure is null then
    select ordinality-1 into v_index from jsonb_array_elements(v_proposal.entries) with ordinality
      where lower(value->>'entryId')=v_job.command->>'entryId';
    update private.nest_meal_proposals set entries=jsonb_set(entries,array[v_index::text],p_outcome->'entry',false),revision=revision+1
      where proposal_id=v_proposal.proposal_id;
    v_receipt:=(v_job.command-'expectedRevision')||jsonb_build_object('version',1,'actorId',p_actor,'householdId',p_household,
      'previousRevision',v_proposal.revision::text,'revision',(v_proposal.revision+1)::text);
  end if;
  update private.nest_meal_proposal_edits set status=case when v_failure is null then 'applied' else 'failed' end,
    failure=v_failure,receipt=v_receipt,finish_hash=v_hash where actor_id=p_actor and household_id=p_household and operation_id=p_operation returning * into v_job;
  return private.nest_proposal_edit_json(v_job);
exception when lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Proposal changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_begin_proposal_edit(uuid,uuid,jsonb),private.nest_read_proposal_edit(uuid,uuid),
  private.nest_claim_proposal_edit(uuid,uuid,uuid,uuid),private.nest_finish_proposal_edit(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_begin_proposal_edit(uuid,uuid,jsonb),private.nest_read_proposal_edit(uuid,uuid) to authenticated;
grant execute on function private.nest_claim_proposal_edit(uuid,uuid,uuid,uuid),private.nest_finish_proposal_edit(uuid,uuid,uuid,jsonb) to service_role;
create function public.nest_begin_proposal_edit(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_begin_proposal_edit($1,$2,$3); $$;
create function public.nest_read_proposal_edit(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_proposal_edit($1,$2); $$;
create function public.nest_claim_proposal_edit(p_actor uuid,p_household uuid,p_operation uuid,p_worker uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_claim_proposal_edit($1,$2,$3,$4); $$;
create function public.nest_finish_proposal_edit(p_actor uuid,p_household uuid,p_operation uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_finish_proposal_edit($1,$2,$3,$4); $$;
revoke all on function public.nest_begin_proposal_edit(uuid,uuid,jsonb),public.nest_read_proposal_edit(uuid,uuid),
  public.nest_claim_proposal_edit(uuid,uuid,uuid,uuid),public.nest_finish_proposal_edit(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_begin_proposal_edit(uuid,uuid,jsonb),public.nest_read_proposal_edit(uuid,uuid) to authenticated;
grant execute on function public.nest_claim_proposal_edit(uuid,uuid,uuid,uuid),public.nest_finish_proposal_edit(uuid,uuid,uuid,jsonb) to service_role;
