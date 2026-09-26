-- Stale proposal/worker/approval baselines require fresh state, not transport retries.
-- Keep existing contention handlers and persist worker validation failures.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('private.nest_approve_meal_proposal(uuid,uuid,jsonb)',4),
    ('private.nest_approved_recipe(uuid,jsonb)',1),
    ('private.nest_begin_meal_proposal(uuid,uuid,jsonb)',1),
    ('private.nest_begin_proposal_edit(uuid,uuid,jsonb)',3),
    ('private.nest_discard_meal_proposal(uuid,uuid,jsonb)',2),
    ('private.nest_finish_meal_proposal(uuid,uuid,uuid,jsonb)',3),
    ('private.nest_finish_proposal_edit(uuid,uuid,uuid,jsonb)',2),
    ('private.nest_lock_proposal_approval(private.nest_meal_proposals)',3),
    ('private.nest_lock_proposal_edit(uuid,uuid,uuid)',1),
    ('private.nest_lock_proposal_worker(uuid,uuid,uuid)',2),
    ('private.nest_meal_proposal_baseline(uuid,jsonb)',1),
    ('private.nest_open_meal_proposal(uuid,uuid)',1),
    ('private.nest_proposal_content(private.nest_meal_proposals,jsonb,jsonb)',2),
    ('private.nest_proposal_edit_selection(private.nest_meal_proposals,jsonb)',1),
    ('private.nest_proposal_saved_source(uuid,jsonb)',2),
    ('private.nest_read_meal_proposal_origin(uuid,uuid)',1),
    ('private.nest_read_meal_proposal(uuid,uuid)',1),
    ('private.nest_read_proposal_edit_snapshot(uuid,uuid)',1)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    v_body := v_definition;
    v_tail := '';
    if position(E'\nexception when ' in v_definition)>0 then
      v_body := split_part(v_definition,E'\nexception when ',1);
      v_tail := substring(v_definition from length(v_body)+1);
    end if;
    if (length(v_body)-length(replace(v_body,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected proposal conflict definition: %',v_target.signature;
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
  for v_target in select * from (values
    ('private.nest_validate_proposal_completion(private.nest_meal_proposals,jsonb)'),
    ('private.nest_validate_proposal_edit(private.nest_meal_proposals,private.nest_meal_proposal_edits,jsonb)')
  ) as validators(signature) loop
    v_definition:=pg_get_functiondef(v_target.signature::regprocedure);
    if position('exception when serialization_failure or lock_not_available' in v_definition)=0 then
      raise exception 'Unexpected proposal validator handler: %',v_target.signature;
    end if;
    execute replace(v_definition,'exception when serialization_failure or lock_not_available',
      'exception when sqlstate ''PT412'' or serialization_failure or lock_not_available');
  end loop;
end;
$patch$;
