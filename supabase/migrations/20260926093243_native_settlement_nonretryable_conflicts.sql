-- Balance changes and cancelled Save intent require user review, not SQL retries.
-- Keep financial locks, approvals, receipt-first replay, ownership and ACLs intact.
do $patch$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'private.nest_validate_settlement_balance(uuid,jsonb)',
    'private.nest_record_settlement(uuid,uuid,jsonb,uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> 1 then
      raise exception 'Unexpected settlement conflict definition: %',v_signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
