-- GATED additive candidate. Native explicit approval only; no AI approval tool or grocery writes.
-- Retain the exact private preview. Library edits never substitute a new recipe at approval.
create function private.nest_lock_proposal_approval(p private.nest_meal_proposals)
returns void language plpgsql security invoker set search_path='' as $$
declare v_context jsonb; v_revision bigint;
begin
  perform 1 from public.household_members where household_id=p.household_id order by user_id for share nowait;
  perform 1 from public.nest_food_profiles where household_id=p.household_id order by actor_id for share nowait;
  perform 1 from public.nest_cooking_preferences where household_id=p.household_id for share nowait;
  v_context:=private.nest_meal_planning_context(p.actor_id,p.household_id);
  if decode(v_context->>'stateHash','hex')<>p.constraints_hash then
    raise exception 'Planning constraints changed' using errcode='40001'; end if;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p.household_id and week_start=p.week_start for update;
  if v_revision is distinct from p.week_revision then raise exception 'Meal week changed' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements(p.entries) e join public.meal_plan_entries m
    on m.household_id=p.household_id and m.date=(e->>'date')::date and m.slot=e->>'slot' and m.removed_at is null) then
    raise exception 'Meal slot occupied' using errcode='40001'; end if;
end;
$$;

create function private.nest_approved_recipe(p_household uuid,p_source jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_recipe jsonb:=p_source->'recipe'; v_ingredients jsonb;
begin
  if p_source->>'kind'='saved' then
    -- Archival/edits do not erase the reviewed snapshot. A missing/reassigned definition conflicts.
    perform 1 from public.meal_definitions where household_id=p_household
      and id=(v_recipe->>'definitionId')::uuid for key share;
    if not found then raise exception 'Recipe source changed' using errcode='40001'; end if;
    return v_recipe;
  end if;
  select jsonb_agg(value||jsonb_build_object('ingredientId',gen_random_uuid(),'order',ordinality-1) order by ordinality)
    into v_ingredients from jsonb_array_elements(v_recipe->'ingredients') with ordinality;
  return v_recipe||jsonb_build_object('definitionId',null,'ingredients',v_ingredients);
end;
$$;

create function private.nest_post_proposal_entries(p private.nest_meal_proposals)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_entry jsonb; v_recipe jsonb; v_posted jsonb; v_entries jsonb:='[]';
begin
  for v_entry in select value from jsonb_array_elements(p.entries) loop
    v_recipe:=private.nest_approved_recipe(p.household_id,v_entry->'source');
    v_posted:=private.nest_insert_selected_recipe(p.household_id,jsonb_build_object(
      'weekStart',to_char(p.week_start,'YYYY-MM-DD'),'date',v_entry->>'date','slot',v_entry->>'slot',
      'expectedLibraryRevision',v_entry#>>'{source,libraryRevision}'),v_recipe,false);
    v_entries:=v_entries||jsonb_build_array(jsonb_build_object('proposalEntryId',lower(v_entry->>'entryId'),
      'entryId',v_posted->>'entryId','date',v_entry->>'date','slot',v_entry->>'slot'));
  end loop;
  return v_entries;
end;
$$;

create function private.nest_approve_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior private.nest_meal_proposal_receipts;
  v_proposal private.nest_meal_proposals; v_result jsonb; v_entries jsonb; v_week_revision bigint;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Proposal changed' using errcode='40001'; end if;
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid proposal operation' using errcode='22023'; end if;
  perform private.nest_meal_proposal_input(p_input,true);
  perform pg_advisory_xact_lock(hashtextextended('nest:proposal:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('action','approve','input',p_input)::text,'UTF8'));
  select * into v_prior from private.nest_meal_proposal_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Proposal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  v_proposal:=private.nest_lock_proposal_worker(v_actor,p_household,(p_input->>'proposalId')::uuid);
  if v_proposal.status<>'ready' or v_proposal.revision<>(p_input->>'expectedRevision')::bigint then
    raise exception 'Proposal changed' using errcode='40001'; end if;
  perform private.nest_lock_proposal_approval(v_proposal);
  v_entries:=private.nest_post_proposal_entries(v_proposal);
  -- Check after every potentially blocking lock/write. Expired approval rolls back all entries.
  if clock_timestamp()>=v_proposal.expires_at then raise exception 'Proposal expired' using errcode='40001'; end if;
  select revision into v_week_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_proposal.week_start;
  if v_week_revision<>v_proposal.week_revision+jsonb_array_length(v_entries) then
    raise exception 'Meal week changed' using errcode='40001'; end if;
  update private.nest_meal_proposals set status='approved',revision=revision+1 where proposal_id=v_proposal.proposal_id;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'proposalId',v_proposal.proposal_id,'approvedRevision',v_proposal.revision::text,'revision',(v_proposal.revision+1)::text,
    'weekStart',to_char(v_proposal.week_start,'YYYY-MM-DD'),'previousWeekRevision',v_proposal.week_revision::text,
    'weekRevision',v_week_revision::text,'entries',v_entries);
  insert into private.nest_meal_proposal_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or foreign_key_violation or lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Proposal changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_lock_proposal_approval(private.nest_meal_proposals),private.nest_approved_recipe(uuid,jsonb),
  private.nest_post_proposal_entries(private.nest_meal_proposals),private.nest_approve_meal_proposal(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_approve_meal_proposal(uuid,uuid,jsonb) to authenticated;
create function public.nest_approve_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_approve_meal_proposal($1,$2,$3); $$;
revoke all on function public.nest_approve_meal_proposal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_approve_meal_proposal(uuid,uuid,jsonb) to authenticated;
