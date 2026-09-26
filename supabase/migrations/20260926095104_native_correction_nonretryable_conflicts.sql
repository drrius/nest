-- Cancelled saves and stale financial reviews cannot become valid through retries.
-- Preserve approval, exact replay and append-only posting order.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_record_correction(uuid,uuid,jsonb,uuid)',2)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected correction conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
