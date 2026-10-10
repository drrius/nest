create or replace function private.nest_routine_schedule_keys(p_kind text,p_rule_kind text)
returns text[] language sql immutable security invoker set search_path='' as $$
  select keys from (values
    ('one_off','one_off',array['kind','date']),
    ('calendar','daily',array['kind']),
    ('calendar','weekdays',array['kind','days']),
    ('calendar','weekly',array['kind','weekday']),
    ('calendar','biweekly',array['kind','weekday']),
    ('calendar','monthly',array['kind','dayOfMonth']),
    ('after_completion','after_completion',array['kind','every','unit'])
  ) rules(schedule_kind,rule_kind,keys)
  where schedule_kind=p_kind and rule_kind=p_rule_kind;
$$;

create or replace function private.nest_routine_schedule_shape(p_rule jsonb,p_keys text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(p_rule)='object' then
    coalesce(p_rule ?& p_keys and p_rule-p_keys='{}'::jsonb,false)
  else false end;
$$;

create or replace function private.nest_routine_schedule_integer(p_value jsonb,p_max integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number'
    or (p_value #>> '{}') !~ '^[0-9]+$' then return false; end if;
  return coalesce((p_value #>> '{}')::integer between 1 and p_max,false);
exception when numeric_value_out_of_range or invalid_text_representation then
  return false;
end;
$$;

create or replace function private.nest_routine_schedule_date(p_value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_date date;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then return false; end if;
  v_date:=(p_value #>> '{}')::date;
  return coalesce(to_char(v_date,'YYYY-MM-DD')=p_value #>> '{}',false);
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

create or replace function private.nest_routine_schedule_weekdays(p_days jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_day jsonb;v_seen integer[]:='{}';v_value integer;
begin
  if jsonb_typeof(p_days) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_days)=0 then return false; end if;
  for v_day in select value from jsonb_array_elements(p_days) loop
    if not private.nest_routine_schedule_integer(v_day,7) then return false; end if;
    v_value:=(v_day #>> '{}')::integer;
    if v_value=any(v_seen) then return false; end if;
    v_seen:=array_append(v_seen,v_value);
  end loop;
  return true;
end;
$$;

create or replace function private.is_valid_routine_schedule(p_schedule_kind text,p_schedule_rule jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_kind text:=p_schedule_rule->>'kind';
begin
  if not private.nest_routine_schedule_shape(p_schedule_rule,
    private.nest_routine_schedule_keys(p_schedule_kind,v_kind)) then return false; end if;
  return coalesce(case v_kind
    when 'one_off' then private.nest_routine_schedule_date(p_schedule_rule->'date')
    when 'daily' then true
    when 'weekdays' then private.nest_routine_schedule_weekdays(p_schedule_rule->'days')
    when 'weekly' then private.nest_routine_schedule_integer(p_schedule_rule->'weekday',7)
    when 'biweekly' then private.nest_routine_schedule_integer(p_schedule_rule->'weekday',7)
    when 'monthly' then private.nest_routine_schedule_integer(p_schedule_rule->'dayOfMonth',31)
    when 'after_completion' then private.nest_routine_schedule_integer(p_schedule_rule->'every',2147483647)
      and p_schedule_rule->>'unit' in ('days','weeks')
    else false end,false);
end;
$$;

revoke all on function private.nest_routine_schedule_keys(text,text),
  private.nest_routine_schedule_shape(jsonb,text[]),private.nest_routine_schedule_integer(jsonb,integer),
  private.nest_routine_schedule_date(jsonb),private.nest_routine_schedule_weekdays(jsonb) from public,anon;
grant execute on function private.nest_routine_schedule_keys(text,text),
  private.nest_routine_schedule_shape(jsonb,text[]),private.nest_routine_schedule_integer(jsonb,integer),
  private.nest_routine_schedule_date(jsonb),private.nest_routine_schedule_weekdays(jsonb) to authenticated,service_role;

-- Revalidate existing definitions without repairing or deleting any retained row.
-- Replacing the predicate alone does not recheck an existing CHECK constraint.
do $$
declare v_constraint text;
begin
  if (select count(*) from pg_constraint where conrelid='public.routines'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%is_valid_routine_schedule(%')<>1 then
    raise exception 'Expected one retained routine schedule constraint';
  end if;
  select conname into v_constraint from pg_constraint where conrelid='public.routines'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%is_valid_routine_schedule(%';
  execute format('alter table public.routines drop constraint %I',v_constraint);
  execute format('alter table public.routines add constraint %I check
    (private.is_valid_routine_schedule(schedule_kind,schedule_rule) is true) not valid',v_constraint);
  execute format('alter table public.routines validate constraint %I',v_constraint);
end;
$$;
