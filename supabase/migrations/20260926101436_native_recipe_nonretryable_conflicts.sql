-- Stale recipe/library/selection baselines require a fresh review.
-- Preserve every existing exception-handler tail and planned-snapshot boundary.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('private.nest_create_recipe(uuid,uuid,jsonb)',2),
    ('private.nest_edit_recipe(uuid,uuid,jsonb)',3),
    ('private.nest_archive_recipe(uuid,uuid,jsonb)',3),
    ('private.nest_insert_recipe(uuid,jsonb)',1),
    ('private.nest_meal_library_revision(uuid,text)',1),
    ('private.nest_capture_recipe(uuid,uuid,text)',3),
    ('private.nest_planned_recipe(uuid,text,text,uuid)',1),
    ('private.nest_lock_recipe_destination(uuid,jsonb,boolean)',3),
    ('private.nest_lock_recipe_selection(uuid,uuid,jsonb)',3),
    ('private.nest_select_recipe(uuid,uuid,jsonb,boolean)',1)
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
      raise exception 'Unexpected recipe conflict definition: %',v_target.signature;
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
end;
$patch$;
