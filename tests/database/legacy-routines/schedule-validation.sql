-- Audited test-only source excerpts from household-os 4a528c9.
-- Native creation subset; not a full legacy closure/edit engine rehearsal.
create or replace function private.is_valid_routine_schedule(
  p_schedule_kind text,
  p_schedule_rule jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  rule_kind text;
  item jsonb;
  value_integer integer;
  seen_weekdays integer[] := '{}';
  value_date date;
begin
  if p_schedule_rule is null or jsonb_typeof(p_schedule_rule) <> 'object' then
    return false;
  end if;

  rule_kind := p_schedule_rule ->> 'kind';
  case rule_kind
    when 'one_off' then
      if p_schedule_kind <> 'one_off'
        or p_schedule_rule - array['kind', 'date'] <> '{}'::jsonb
        or jsonb_typeof(p_schedule_rule -> 'date') <> 'string'
      then
        return false;
      end if;
      value_date := (p_schedule_rule ->> 'date')::date;
      return to_char(value_date, 'YYYY-MM-DD') = p_schedule_rule ->> 'date';
    when 'daily' then
      return p_schedule_kind = 'calendar'
        and p_schedule_rule = '{"kind":"daily"}'::jsonb;
    when 'weekdays' then
      if p_schedule_kind <> 'calendar'
        or p_schedule_rule - array['kind', 'days'] <> '{}'::jsonb
        or jsonb_typeof(p_schedule_rule -> 'days') <> 'array'
        or jsonb_array_length(p_schedule_rule -> 'days') = 0
      then
        return false;
      end if;

      for item in
        select element
        from jsonb_array_elements(p_schedule_rule -> 'days') as days(element)
      loop
        if jsonb_typeof(item) <> 'number'
          or (item #>> '{}') !~ '^[0-9]+$'
        then
          return false;
        end if;
        value_integer := (item #>> '{}')::integer;
        if value_integer not between 1 and 7
          or value_integer = any(seen_weekdays)
        then
          return false;
        end if;
        seen_weekdays := array_append(seen_weekdays, value_integer);
      end loop;
      return true;
    when 'weekly', 'biweekly' then
      if p_schedule_kind <> 'calendar'
        or p_schedule_rule - array['kind', 'weekday'] <> '{}'::jsonb
        or jsonb_typeof(p_schedule_rule -> 'weekday') <> 'number'
        or (p_schedule_rule ->> 'weekday') !~ '^[0-9]+$'
      then
        return false;
      end if;
      return (p_schedule_rule ->> 'weekday')::integer between 1 and 7;
    when 'monthly' then
      if p_schedule_kind <> 'calendar'
        or p_schedule_rule - array['kind', 'dayOfMonth'] <> '{}'::jsonb
        or jsonb_typeof(p_schedule_rule -> 'dayOfMonth') <> 'number'
        or (p_schedule_rule ->> 'dayOfMonth') !~ '^[0-9]+$'
      then
        return false;
      end if;
      return (p_schedule_rule ->> 'dayOfMonth')::integer between 1 and 31;
    when 'after_completion' then
      if p_schedule_kind <> 'after_completion'
        or p_schedule_rule - array['kind', 'every', 'unit'] <> '{}'::jsonb
        or jsonb_typeof(p_schedule_rule -> 'every') <> 'number'
        or (p_schedule_rule ->> 'every') !~ '^[0-9]+$'
        or p_schedule_rule ->> 'unit' not in ('days', 'weeks')
      then
        return false;
      end if;
      return (p_schedule_rule ->> 'every')::integer >= 1;
    else
      return false;
  end case;
exception
  when others then
    return false;
end;
$$;
