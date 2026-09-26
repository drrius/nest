-- Terminal chore baselines do not become valid on transport retry.
-- Keep lock_not_available handlers and genuine serialization retries unchanged.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('private.nest_change_chore(uuid,uuid,uuid,date,text,date)',2),
    ('private.nest_request_chore_transfer(uuid,uuid,date,uuid)',2),
    ('private.nest_respond_chore_transfer(uuid,uuid,text)',3),
    ('private.nest_set_routine_state(uuid,uuid,uuid,text,text)',1),
    ('private.nest_create_routine(uuid,uuid,jsonb)',1)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    v_body := v_definition;
    v_tail := '';
    if v_target.signature='private.nest_change_chore(uuid,uuid,uuid,date,text,date)' then
      if position(E'exception\n  when lock_not_available then' in v_definition)=0 then
        raise exception 'Unexpected chore contention handler';
      end if;
      v_body := split_part(v_definition,E'exception\n  when lock_not_available then',1);
      v_tail := substring(v_definition from length(v_body)+1);
    end if;
    if (length(v_body)-length(replace(v_body,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected chore edit conflict definition: %',v_target.signature;
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
end;
$patch$;
