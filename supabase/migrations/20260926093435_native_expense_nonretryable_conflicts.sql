-- Unavailable categories/receipts and cancelled Save intent are terminal conflicts.
-- Keep the current financial authorization, approval and receipt implementations intact.
do $patch$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'private.nest_validate_expense_receipt(jsonb,uuid)',
    'private.nest_expense_payload(jsonb,uuid)',
    'private.nest_record_expense(uuid,uuid,jsonb,uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> 1 then
      raise exception 'Unexpected expense conflict definition: %',v_signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
