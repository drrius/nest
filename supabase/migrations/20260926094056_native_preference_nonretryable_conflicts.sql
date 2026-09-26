-- Version mismatches need a fresh user review, not transaction serialization retries.
do $patch$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'private.nest_save_food_profile(uuid,uuid,bigint,text[],text[],integer,numeric)',
    'private.nest_save_cooking_preferences(uuid,uuid,bigint,text,text[])',
    'private.nest_save_notification_preferences(uuid,uuid,bigint,boolean,text,boolean)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,
      'errcode=''40001''','')))/length('errcode=''40001''') <> 1 then
      raise exception 'Unexpected preference conflict definition: %',v_signature;
    end if;
    execute replace(v_definition,'errcode=''40001''','errcode=''PT412''');
  end loop;
end;
$patch$;
