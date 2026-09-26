-- Cancelled or stale recurring commands require a new reviewed request.
-- Preserve mandate locks, approval consumption, cycle uniqueness and exact replay.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_set_recurring(uuid,uuid,jsonb,uuid)',3),
    ('private.nest_save_recurring(uuid,uuid,jsonb)',1),
    ('private.nest_change_recurring_state(uuid,uuid,jsonb,uuid)',1),
    ('private.nest_save_recurring_state(uuid,uuid,jsonb)',1),
    ('private.nest_resume_recurring(uuid,uuid,jsonb,uuid)',4),
    ('private.nest_record_variable_cycle(uuid,uuid,jsonb,uuid)',3),
    ('private.nest_save_variable_cycle(uuid,uuid,jsonb)',1),
    ('private.nest_post_fixed_cycle(uuid,uuid,uuid,date)',5),
    ('private.nest_link_manual_cycle(uuid,uuid,jsonb,uuid)',4)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected recurring conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
