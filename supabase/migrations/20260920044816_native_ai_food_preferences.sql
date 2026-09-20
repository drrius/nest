-- GATED additive candidate. No hosted application is authorized.
-- Own food preferences use the existing atomic turn journal and native profile command.
-- Match the shared JavaScript codec: UTF-16 code units and ECMAScript trim.
-- PostgreSQL length(text) counts a non-BMP character once, JavaScript counts two.
create or replace function private.nest_valid_food_texts(p_values text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_values is not null and coalesce(array_ndims(p_values),1)=1
    and cardinality(p_values)<=32 and not exists(
      select 1 from unnest(p_values) item where item is null or length(item)>120
        or length(item)+(select count(*) from regexp_split_to_table(item,'') character
          where ascii(character)>65535)>120
        or btrim(item,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
    );
$$;

alter table public.nest_ai_commands drop constraint nest_ai_commands_tool_name_check;
alter table public.nest_ai_commands add constraint nest_ai_commands_tool_name_check
  check(tool_name in ('completeChore','addGrocery','editGrocery','removeGrocery','checkGrocery','saveFoodPreferences'));

create function private.nest_validate_ai_food_preferences(p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_preferences jsonb; v_key text; v_value jsonb; v_number numeric;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>65536
    or not (p_input ?& array['expectedRevision','preferences'])
    or p_input-array['expectedRevision','preferences']<>'{}'::jsonb
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid food command' using errcode='22023';
  end if;
  if (p_input->>'expectedRevision')::numeric>9223372036854775807 then
    raise exception 'Invalid food revision' using errcode='22023';
  end if;
  v_preferences:=p_input->'preferences';
  if jsonb_typeof(v_preferences) is distinct from 'object'
    or not (v_preferences ?& array['restrictions','dislikes','calorieGoal','portions'])
    or v_preferences-array['restrictions','dislikes','calorieGoal','portions']<>'{}'::jsonb then
    raise exception 'Invalid food preferences' using errcode='22023';
  end if;
  foreach v_key in array array['restrictions','dislikes'] loop
    if jsonb_typeof(v_preferences->v_key) is distinct from 'array' then
      raise exception 'Invalid food list' using errcode='22023';
    end if;
    if jsonb_array_length(v_preferences->v_key)>32 then
      raise exception 'Food list too long' using errcode='22023';
    end if;
    for v_value in select jsonb_array_elements(v_preferences->v_key) loop
      if jsonb_typeof(v_value)<>'string' then
        raise exception 'Invalid food entry' using errcode='22023';
      end if;
    end loop;
  end loop;
  if jsonb_typeof(v_preferences->'calorieGoal') not in ('null','number')
    or jsonb_typeof(v_preferences->'portions')<>'number' then
    raise exception 'Invalid food quantities' using errcode='22023';
  end if;
  if jsonb_typeof(v_preferences->'calorieGoal')='number' then
    v_number:=(v_preferences->>'calorieGoal')::numeric;
    if v_number<>trunc(v_number) or v_number not between 1 and 20000 then
      raise exception 'Invalid calorie goal' using errcode='22023';
    end if;
  end if;
  -- Native command validates text lengths/blank entries and allowed half portions.
end;
$$;
revoke all on function private.nest_validate_ai_food_preferences(jsonb) from public,anon,authenticated;

create or replace function private.nest_validate_ai_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_keys text[]; v_key text; v_type text;
begin
  if p_tool='saveFoodPreferences' then
    perform private.nest_validate_ai_food_preferences(p_input);
    return;
  end if;
  v_keys:=case p_tool
    when 'completeChore' then array['occurrenceId','expectedDueDate','completedOn']
    when 'addGrocery' then array['name','quantity','unit','categoryId']
    when 'editGrocery' then array['itemId','expectedVersion','name','quantity','unit','categoryId']
    when 'removeGrocery' then array['itemId','expectedVersion']
    when 'checkGrocery' then array['itemId','expectedVersion','checked'] end;
  if v_keys is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>65536 or not (p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid AI command' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    v_type:=jsonb_typeof(p_input->v_key);
    if v_key<>'checked' and not (v_type='string' or
      (v_type='null' and v_key in ('quantity','unit','categoryId'))) then
      raise exception 'Invalid command field type' using errcode='22023';
    end if;
  end loop;
  if p_tool='completeChore' and (p_input->>'expectedDueDate' !~ '^\d{4}-\d{2}-\d{2}$'
    or p_input->>'completedOn' !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Invalid command date' using errcode='22023';
  end if;
  if p_input ? 'expectedVersion' and (jsonb_typeof(p_input->'expectedVersion')<>'string'
    or p_input->>'expectedVersion' !~ '^[1-9][0-9]{0,18}$') then
    raise exception 'Invalid command version' using errcode='22023';
  end if;
  if p_tool='checkGrocery' and jsonb_typeof(p_input->'checked')<>'boolean' then
    raise exception 'Invalid check state' using errcode='22023';
  end if;
end;
$$;

create or replace function private.nest_dispatch_ai_command(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target uuid; v_action text;
begin
  if p_tool='saveFoodPreferences' then
    return private.nest_save_food_profile(p_household,p_operation,(p_input->>'expectedRevision')::bigint,
      array(select jsonb_array_elements_text(p_input->'preferences'->'restrictions')),
      array(select jsonb_array_elements_text(p_input->'preferences'->'dislikes')),
      (p_input->'preferences'->>'calorieGoal')::integer,(p_input->'preferences'->>'portions')::numeric);
  end if;
  -- This internal dispatcher is never directly executable by a client.
  if p_tool='completeChore' then
    v_target:=(p_input->>'occurrenceId')::uuid;
    if not exists(select 1 from public.routine_occurrences where id=v_target and household_id=p_household) then
      raise exception 'Not authorized' using errcode='42501';
    end if;
    return private.nest_complete_chore(v_target,p_operation,
      (p_input->>'expectedDueDate')::date,(p_input->>'completedOn')::date);
  end if;
  v_target:=case when p_tool='addGrocery' then gen_random_uuid() else (p_input->>'itemId')::uuid end;
  if p_tool='checkGrocery' then
    return private.nest_set_grocery_checked(p_household,p_operation,v_target,
      (p_input->>'expectedVersion')::bigint,(p_input->>'checked')::boolean);
  end if;
  v_action:=case p_tool when 'addGrocery' then 'add' when 'editGrocery' then 'edit' when 'removeGrocery' then 'remove' end;
  if v_action is null then raise exception 'Unsupported AI command' using errcode='22023'; end if;
  return private.nest_edit_grocery(p_household,p_operation,v_action,v_target,
    (p_input->>'expectedVersion')::bigint,p_input->>'name',p_input->>'quantity',p_input->>'unit',
    (p_input->>'categoryId')::uuid);
end;
$$;

create or replace function private.nest_ai_command_response(p_turn public.nest_ai_turns,p_response jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_journal jsonb; v_parts jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('type','tool-'||tool_name,'toolCallId',tool_call_id,
    'state','output-available','input',input,'output',result) order by sequence),'[]'::jsonb)
    into v_journal from public.nest_ai_commands
    where conversation_id=p_turn.conversation_id and turn_id=p_turn.operation_id;
  if p_response is null and v_journal='[]'::jsonb then return null; end if;
  if p_response is null then
    p_response:=jsonb_build_object('id',p_turn.assistant_id,'role','assistant','parts','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(part order by position),'[]'::jsonb) into v_parts
    from jsonb_array_elements(p_response->'parts') with ordinality as parts(part,position)
    where coalesce(part->>'type','') not in
      ('tool-completeChore','tool-addGrocery','tool-editGrocery','tool-removeGrocery','tool-checkGrocery','tool-saveFoodPreferences');
  return jsonb_set(p_response,'{parts}',v_parts||v_journal);
end;
$$;
