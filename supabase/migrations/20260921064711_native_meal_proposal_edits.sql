-- GATED additive candidate. Private suggestion edits never post shared meals or groceries.
create table private.nest_meal_proposal_edits (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  proposal_id uuid not null references private.nest_meal_proposals(proposal_id),
  requested_revision bigint not null check(requested_revision>0), command jsonb not null,
  selected_source jsonb, worker_id uuid, deadline_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','applied','failed')),
  failure text check(failure in ('unavailable','constraints_changed','no_suitable_meals')),
  receipt jsonb, finish_hash bytea check(octet_length(finish_hash)=32),
  primary key(actor_id,household_id,operation_id),
  check((status='applied')=(receipt is not null)), check((status='failed')=(failure is not null)),
  check((status='pending')=(finish_hash is null))
);
create unique index nest_one_pending_proposal_edit on private.nest_meal_proposal_edits(proposal_id,requested_revision) where status='pending';
alter table private.nest_meal_proposal_edits enable row level security;
revoke all on private.nest_meal_proposal_edits from public,anon,authenticated,service_role;

create function private.nest_proposal_edit_input(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['action','proposalId','expectedRevision','entryId']; v_result jsonb; v_revision bigint;
begin
  if p_input->>'action'='choose' then v_keys:=v_keys||array['definitionId','expectedLibraryRevision']; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb
    or p_input->>'action' not in ('replace','choose') or jsonb_typeof(p_input->'action') is distinct from 'string'
    or jsonb_typeof(p_input->'entryId') is distinct from 'string'
    or p_input->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid proposal edit' using errcode='22023'; end if;
  perform private.nest_meal_proposal_input(p_input-array['action','entryId','definitionId','expectedLibraryRevision'],true);
  v_result:=p_input||jsonb_build_object('proposalId',lower(p_input->>'proposalId'),'entryId',lower(p_input->>'entryId'));
  if p_input->>'action'='choose' then
    if jsonb_typeof(p_input->'definitionId') is distinct from 'string'
      or p_input->>'definitionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_input->'expectedLibraryRevision') is distinct from 'string'
      or p_input->>'expectedLibraryRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
      raise exception 'Invalid saved selection' using errcode='22023'; end if;
    v_revision:=(p_input->>'expectedLibraryRevision')::bigint;
    v_result:=v_result||jsonb_build_object('definitionId',lower(p_input->>'definitionId'));
  end if;
  return v_result;
exception when numeric_value_out_of_range then raise exception 'Invalid proposal edit' using errcode='22023';
end;
$$;
create function private.nest_proposal_edit_json(p private.nest_meal_proposal_edits)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('version',1,'actorId',p.actor_id,'householdId',p.household_id,'command',p.command,
    'expiresAt',floor(extract(epoch from p.deadline_at)*1000)::bigint,'status',p.status,'failure',p.failure,'receipt',p.receipt);
$$;
create function private.nest_expire_proposal_edits(p private.nest_meal_proposals)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update private.nest_meal_proposal_edits set status='failed',
    failure=case when deadline_at<=clock_timestamp() or p.expires_at<=clock_timestamp() then 'unavailable' else 'constraints_changed' end,
    finish_hash=sha256(convert_to('expired','UTF8')) where proposal_id=p.proposal_id and status='pending'
    and (deadline_at<=clock_timestamp() or p.expires_at<=clock_timestamp() or p.status<>'ready' or requested_revision<>p.revision);
end;
$$;
create function private.nest_lock_proposal_edit(p_actor uuid,p_household uuid,p_operation uuid)
returns private.nest_meal_proposals language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_proposal private.nest_meal_proposals;
begin
  if p_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where user_id=p_actor and household_id=p_household for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select proposal_id into v_id from private.nest_meal_proposal_edits
    where actor_id=p_actor and household_id=p_household and operation_id=p_operation;
  if not found then raise exception 'Proposal edit changed' using errcode='40001'; end if;
  v_proposal:=private.nest_lock_proposal_worker(p_actor,p_household,v_id);
  return v_proposal;
end;
$$;
create function private.nest_proposal_edit_selection(p private.nest_meal_proposals,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_entry jsonb; v_source jsonb;
begin
  select value into v_entry from jsonb_array_elements(p.entries) where lower(value->>'entryId')=p_input->>'entryId';
  if not found then raise exception 'Proposal entry changed' using errcode='40001'; end if;
  if p_input->>'action'='replace' then return null; end if;
  v_source:=jsonb_build_object('kind','saved','libraryRevision',p_input->>'expectedLibraryRevision','recipe',
    private.nest_capture_recipe(p.household_id,(p_input->>'definitionId')::uuid,p_input->>'expectedLibraryRevision'));
  perform private.nest_proposal_saved_source(p.household_id,v_source);
  if v_entry#>>'{source,recipe,definitionId}'=p_input->>'definitionId' then
    raise exception 'Same saved recipe' using errcode='22023'; end if;
  return v_source;
end;
$$;
create function private.nest_proposal_edit_outcome(p_outcome jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['workerId','entry','failure'];
begin
  if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>4194304
    or not(p_outcome ?& v_keys) or p_outcome-v_keys<>'{}'::jsonb
    or jsonb_typeof(p_outcome->'workerId') is distinct from 'string'
    or p_outcome->>'workerId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid edit outcome' using errcode='22023'; end if;
  if p_outcome->'failure'='null'::jsonb then
    if jsonb_typeof(p_outcome->'entry') is distinct from 'object' then raise exception 'Invalid edit entry' using errcode='22023'; end if;
  elsif jsonb_typeof(p_outcome->'failure') is distinct from 'string' or p_outcome->'entry'<>'null'::jsonb
    or p_outcome->>'failure' not in ('unavailable','constraints_changed','no_suitable_meals') then
    raise exception 'Invalid edit failure' using errcode='22023'; end if;
end;
$$;
create function private.nest_validate_proposal_edit(p private.nest_meal_proposals,j private.nest_meal_proposal_edits,p_entry jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare v_old jsonb;
begin
  if p.status<>'ready' or p.revision<>j.requested_revision then return 'constraints_changed'; end if;
  perform private.nest_lock_proposal_approval(p);
  select value into v_old from jsonb_array_elements(p.entries) where lower(value->>'entryId')=j.command->>'entryId';
  if not found then return 'constraints_changed'; end if;
  perform private.nest_proposal_entry(p,p_entry);
  if lower(p_entry->>'entryId')<>j.command->>'entryId' or p_entry->'date'<>v_old->'date' or p_entry->'slot'<>v_old->'slot'
    or (j.selected_source is not null and p_entry->'source'<>j.selected_source)
    or p_entry->'source'=v_old->'source'
    or (p_entry#>>'{source,recipe,definitionId}'=v_old#>>'{source,recipe,definitionId}') then
    raise exception 'Invalid replacement entry' using errcode='22023'; end if;
  return null;
exception when serialization_failure or lock_not_available or deadlock_detected or object_not_in_prerequisite_state then
  return 'constraints_changed';
end;
$$;
revoke all on function private.nest_proposal_edit_input(jsonb),private.nest_proposal_edit_json(private.nest_meal_proposal_edits),
  private.nest_expire_proposal_edits(private.nest_meal_proposals),private.nest_lock_proposal_edit(uuid,uuid,uuid),
  private.nest_proposal_edit_selection(private.nest_meal_proposals,jsonb),private.nest_proposal_edit_outcome(jsonb),
  private.nest_validate_proposal_edit(private.nest_meal_proposals,private.nest_meal_proposal_edits,jsonb)
  from public,anon,authenticated,service_role;
