-- Stale memory state, expired consent and capacity require user action, not transport retries.
-- Preserve approval rollback and private receipt replay.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_change_memory(uuid,uuid,uuid,bigint,text,uuid,boolean)',1),
    ('private.nest_decide_memory(uuid,uuid,uuid,bigint,text,uuid,boolean)',2)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected memory conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
