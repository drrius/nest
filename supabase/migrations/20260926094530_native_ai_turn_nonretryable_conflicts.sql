-- Terminal ownership, revision and deadline conflicts must not trigger transport retries.
-- Preserve command replay, transcript guards and exception handlers in current definitions.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb)',2),
    ('private.nest_finish_ai_turn(uuid,uuid,uuid,text,jsonb)',2),
    ('private.nest_save_conversation(uuid,uuid,uuid,bigint,integer,jsonb)',1),
    ('private.nest_guard_running_transcript()',1),
    ('private.nest_execute_ai_command(uuid,uuid,uuid,text,text,jsonb)',1)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected AI turn conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
