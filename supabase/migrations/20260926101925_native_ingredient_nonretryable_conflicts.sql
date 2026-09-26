-- Stale reviewed ingredients require a fresh review, never automatic retries.
-- Preserve lock/deadlock and constraint handlers; missing sources are terminal.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('private.nest_add_meal_ingredients(uuid,uuid,jsonb)',2),
    ('private.nest_add_reviewed_ingredient(uuid,date,jsonb)',2),
    ('private.nest_read_meal_ingredients(uuid,text,text,jsonb)',1)
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
      raise exception 'Unexpected ingredient conflict definition: %',v_target.signature;
    end if;
    if v_target.signature='private.nest_add_reviewed_ingredient(uuid,date,jsonb)' then
      if position('exception when no_data_found or too_many_rows or lock_not_available then' in v_tail)=0 then
        raise exception 'Unexpected ingredient source handler';
      end if;
      v_tail:=replace(v_tail,
        'exception when no_data_found or too_many_rows or lock_not_available then',
        E'exception when no_data_found or too_many_rows then\n  raise exception ''Ingredient source changed'' using errcode=''PT412'';\nwhen lock_not_available then');
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
end;
$patch$;
