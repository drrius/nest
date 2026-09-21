-- GATED additive candidate. Private reservations only: no model calls or meal/grocery writes.
create table private.nest_meal_proposals (
  proposal_id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  household_id uuid not null references public.households(id), week_start date not null,
  week_revision bigint not null check(week_revision>=0), familiar_only boolean not null,
  revision bigint not null default 1 check(revision>0),
  status text not null default 'generating' check(status in ('generating','ready','failed','approved','discarded')),
  entries jsonb, failure text check(failure in ('unavailable','constraints_changed','incomplete_preferences','no_suitable_meals')),
  constraints_hash bytea not null check(octet_length(constraints_hash)=32),
  expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
  created_at timestamptz not null default clock_timestamp(),
  check((status='failed')=(failure is not null)),
  check((entries is null and status in ('generating','failed','discarded')) or
    (entries is not null and jsonb_typeof(entries)='array' and jsonb_array_length(entries) between 1 and 21
      and status in ('ready','approved','discarded')))
);
create table private.nest_meal_proposal_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(actor_id,household_id,operation_id)
);
alter table private.nest_meal_proposals enable row level security;
alter table private.nest_meal_proposal_receipts enable row level security;
revoke all on private.nest_meal_proposals,private.nest_meal_proposal_receipts from public,anon,authenticated,service_role;

create function private.nest_meal_proposal_json(p private.nest_meal_proposals)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('proposalId',p.proposal_id,'revision',p.revision::text,
    'weekStart',to_char(p.week_start,'YYYY-MM-DD'),'weekRevision',p.week_revision::text,
    'familiarOnly',p.familiar_only,'status',p.status,'entries',p.entries,'failure',p.failure,
    'expiresAt',floor(extract(epoch from p.expires_at)*1000)::bigint);
$$;

create function private.nest_meal_proposal_input(p_input jsonb,p_discard boolean)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]; v_revision bigint;
begin
  v_keys:=case when p_discard then array['proposalId','expectedRevision']
    else array['weekStart','expectedWeekRevision','familiarOnly'] end;
  if p_discard is null or jsonb_typeof(p_input) is distinct from 'object'
    or not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid meal proposal input' using errcode='22023';
  end if;
  if p_discard then
    if jsonb_typeof(p_input->'proposalId') is distinct from 'string'
      or p_input->>'proposalId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
      or p_input->>'expectedRevision' !~ '^[1-9][0-9]{0,18}$' then
      raise exception 'Invalid meal proposal input' using errcode='22023'; end if;
    v_revision:=(p_input->>'expectedRevision')::bigint;
  else
    if jsonb_typeof(p_input->'weekStart') is distinct from 'string'
      or jsonb_typeof(p_input->'expectedWeekRevision') is distinct from 'string'
      or p_input->>'expectedWeekRevision' !~ '^(0|[1-9][0-9]{0,18})$'
      or jsonb_typeof(p_input->'familiarOnly') is distinct from 'boolean' then
      raise exception 'Invalid meal proposal input' using errcode='22023'; end if;
    v_revision:=(p_input->>'expectedWeekRevision')::bigint;
    perform private.nest_meal_placement_dates(p_input->>'weekStart',p_input->>'weekStart');
  end if;
exception when numeric_value_out_of_range then
  raise exception 'Invalid meal proposal input' using errcode='22023';
end;
$$;

create function private.nest_meal_proposal_baseline(p_household uuid,p_input jsonb)
returns bytea language plpgsql security invoker set search_path='' as $$
declare v_week date:=(p_input->>'weekStart')::date; v_revision bigint; v_context jsonb; v_snapshot jsonb;
begin
  v_context:=private.nest_meal_planning_context(auth.uid(),p_household);
  if v_context->'cooking'='null'::jsonb or exists(select 1 from jsonb_array_elements(v_context->'members') m where m->'profile'='null'::jsonb) then
    raise exception 'Food setup incomplete' using errcode='55000'; end if;
  insert into public.nest_meal_week_revisions(household_id,week_start,revision) values(p_household,v_week,0)
    on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedWeekRevision')::bigint then
    raise exception 'Meal week changed' using errcode='40001'; end if;
  v_snapshot:=private.nest_meal_week_snapshot(p_household,p_input->>'weekStart');
  if not exists(select 1 from generate_series(0,6) d cross join jsonb_array_elements_text(v_context#>'{cooking,preferences,mealSlots}') slot
    where not exists(select 1 from jsonb_array_elements(v_snapshot->'entries') entry
      where entry->>'date'=to_char(v_week+d,'YYYY-MM-DD') and entry->>'slot'=slot)) then
    raise exception 'No empty meal slots' using errcode='55000'; end if;
  return decode(v_context->>'stateHash','hex');
end;
$$;

create function private.nest_begin_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior private.nest_meal_proposal_receipts;
  v_constraints bytea; v_proposal uuid; v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Proposal changed' using errcode='40001'; end if;
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid proposal operation' using errcode='22023'; end if;
  perform private.nest_meal_proposal_input(p_input,false);
  perform pg_advisory_xact_lock(hashtextextended('nest:proposal:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('action','begin','input',p_input)::text,'UTF8'));
  select * into v_prior from private.nest_meal_proposal_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Proposal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  v_constraints:=private.nest_meal_proposal_baseline(p_household,p_input);
  insert into private.nest_meal_proposals(actor_id,household_id,week_start,week_revision,familiar_only,constraints_hash)
    values(v_actor,p_household,(p_input->>'weekStart')::date,(p_input->>'expectedWeekRevision')::bigint,
      (p_input->>'familiarOnly')::boolean,v_constraints) returning proposal_id into v_proposal;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'proposalId',v_proposal,'revision','1')||p_input;
  insert into private.nest_meal_proposal_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Proposal changed' using errcode='40001';
end;
$$;

create function private.nest_read_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_proposal private.nest_meal_proposals;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_proposal from private.nest_meal_proposals where proposal_id=p_proposal and actor_id=v_actor and household_id=p_household;
  if not found then raise exception 'Proposal changed' using errcode='40001'; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'proposal',private.nest_meal_proposal_json(v_proposal));
end;
$$;

create function private.nest_discard_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior private.nest_meal_proposal_receipts;
  v_proposal private.nest_meal_proposals; v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Proposal changed' using errcode='40001'; end if;
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid proposal operation' using errcode='22023'; end if;
  perform private.nest_meal_proposal_input(p_input,true);
  perform pg_advisory_xact_lock(hashtextextended('nest:proposal:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('action','discard','input',p_input)::text,'UTF8'));
  select * into v_prior from private.nest_meal_proposal_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Proposal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_proposal from private.nest_meal_proposals where proposal_id=(p_input->>'proposalId')::uuid
    and actor_id=v_actor and household_id=p_household for update;
  if not found or v_proposal.revision<>(p_input->>'expectedRevision')::bigint or v_proposal.status in ('approved','discarded') then
    raise exception 'Proposal changed' using errcode='40001'; end if;
  update private.nest_meal_proposals set status='discarded',revision=revision+1,failure=null where proposal_id=v_proposal.proposal_id;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'proposalId',v_proposal.proposal_id,'previousRevision',v_proposal.revision::text,'revision',(v_proposal.revision+1)::text);
  insert into private.nest_meal_proposal_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Proposal changed' using errcode='40001';
end;
$$;

revoke all on function private.nest_meal_proposal_json(private.nest_meal_proposals),private.nest_meal_proposal_input(jsonb,boolean),
  private.nest_meal_proposal_baseline(uuid,jsonb),private.nest_begin_meal_proposal(uuid,uuid,jsonb),
  private.nest_read_meal_proposal(uuid,uuid),private.nest_discard_meal_proposal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_begin_meal_proposal(uuid,uuid,jsonb),private.nest_read_meal_proposal(uuid,uuid),
  private.nest_discard_meal_proposal(uuid,uuid,jsonb) to authenticated;
create function public.nest_begin_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_begin_meal_proposal($1,$2,$3); $$;
create function public.nest_read_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.nest_read_meal_proposal($1,$2); $$;
create function public.nest_discard_meal_proposal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_discard_meal_proposal($1,$2,$3); $$;
revoke all on function public.nest_begin_meal_proposal(uuid,uuid,jsonb),public.nest_read_meal_proposal(uuid,uuid),
  public.nest_discard_meal_proposal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_begin_meal_proposal(uuid,uuid,jsonb),public.nest_read_meal_proposal(uuid,uuid),
  public.nest_discard_meal_proposal(uuid,uuid,jsonb) to authenticated;
