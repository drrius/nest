-- Superseded consent/capture identities and expired captures cannot succeed on retry.
-- Preserve membership/incarnation locks and the opt-out deletion boundary.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_set_calendar_consent(uuid,uuid,uuid,bigint,boolean)',2),
    ('private.nest_begin_busy_capture(uuid,uuid,bigint)',1),
    ('private.nest_publish_busy(uuid,uuid,bigint,bigint,bigint,bigint,jsonb)',2)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected calendar conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
