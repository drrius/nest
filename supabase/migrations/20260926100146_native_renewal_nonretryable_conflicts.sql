-- Stale renewal/reminder baselines require refresh, not transport retry.
-- Preserve household locks and receipt-first replay.
do $patch$
declare v_target record; v_definition text;
begin
  for v_target in select * from (values
    ('private.nest_change_renewal(uuid,uuid,jsonb,boolean)',1),
    ('public.nest_save_renewal_reminder(uuid,uuid,jsonb)',2)
  ) as targets(signature,expected_count) loop
    v_definition := pg_get_functiondef(v_target.signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> v_target.expected_count then
      raise exception 'Unexpected renewal conflict definition: %',v_target.signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
