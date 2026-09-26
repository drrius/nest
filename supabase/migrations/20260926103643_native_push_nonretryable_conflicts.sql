-- Stale enrollment, completed attempts and advanced checkpoints need fresh state.
-- Preserve receipt-first replay and genuine SQL serialization failures.
do $patch$
declare v_target record; v_definition text; v_body text; v_tail text;
begin
  for v_target in select * from (values
    ('public.nest_save_push_device(uuid,jsonb)',1),
    ('private.nest_save_push_device(uuid,jsonb)',1),
    ('private.nest_finish_push_send_record(uuid,uuid,jsonb)',1),
    ('private.nest_finish_push_receipt_record(uuid,uuid,text,jsonb)',1),
    ('private.nest_save_push_checkpoint(uuid,jsonb)',1),
    ('private.nest_save_summary_push_checkpoint(uuid,jsonb)',1),
    ('private.nest_save_chore_push_checkpoint(uuid,jsonb)',1),
    ('private.nest_save_meal_push_checkpoint(uuid,jsonb)',1),
    ('private.nest_save_grocery_push_checkpoint(uuid,jsonb)',1),
    ('private.nest_save_recurring_push_checkpoint(uuid,jsonb)',1)
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
      raise exception 'Unexpected push conflict definition: %',v_target.signature;
    end if;
    execute replace(v_body,'errcode=''40001''','errcode=''PT412''')||v_tail;
  end loop;
end;
$patch$;
