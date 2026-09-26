-- Stale meal/preparation/routine versions require a fresh review.
-- Preserve existing exception handlers, including genuine contention retries.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('private.nest_create_meal_preparation(uuid,uuid,jsonb)',5),
    ('private.nest_edit_meal_preparation(uuid,uuid,jsonb)',4),
    ('private.nest_insert_meal_preparation(uuid,uuid,jsonb,text)',1),
    ('private.nest_meal_preparation(uuid,text,text,uuid)',1),
    ('public.edit_routine_definition(uuid,timestamp with time zone,text,jsonb)',1)
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
      raise exception 'Unexpected preparation conflict definition: %',v_target.signature;
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
end;
$patch$;
