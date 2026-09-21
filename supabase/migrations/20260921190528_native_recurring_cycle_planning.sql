-- GATED: pure planning for native mandates. No ledger writes or scheduling jobs.
-- Private invoker functions; future authorized commands supply persisted coverage.
create function private.nest_recurring_day(p_schedule jsonb)
returns integer language plpgsql immutable set search_path='' as $$
declare v_field text; v_max integer; v_day integer;
begin
  if p_schedule is null or jsonb_typeof(p_schedule) is distinct from 'object'
    or octet_length(p_schedule::text)>256 then
    raise exception 'Invalid recurring schedule' using errcode='22023';
  end if;
  case p_schedule->>'kind'
    when 'weekly' then v_field:='weekday'; v_max:=7;
    when 'monthly' then v_field:='dayOfMonth'; v_max:=31;
    else raise exception 'Invalid recurring schedule' using errcode='22023';
  end case;
  if not p_schedule ?& array['kind',v_field]
    or p_schedule-array['kind',v_field]<>'{}'::jsonb
    or jsonb_typeof(p_schedule->v_field) is distinct from 'number'
    or (p_schedule->>v_field)::numeric<>trunc((p_schedule->>v_field)::numeric)
    or (p_schedule->>v_field)::numeric not between 1 and v_max then
    raise exception 'Invalid recurring schedule day' using errcode='22023';
  end if;
  v_day:=(p_schedule->>v_field)::numeric::integer;
  return v_day;
end;
$$;
revoke all on function private.nest_recurring_day(jsonb) from public,anon,authenticated;

create function private.nest_first_recurring_date(p_schedule jsonb,p_from date)
returns date language plpgsql immutable set search_path='' as $$
declare v_day integer:=private.nest_recurring_day(p_schedule); v_due date; v_month date; v_last date;
begin
  if p_from is null or not isfinite(p_from) or p_from<date '0001-01-01' or p_from>date '9999-12-31' then
    raise exception 'Invalid recurring date' using errcode='22023';
  end if;
  if p_schedule->>'kind'='weekly' then
    v_due:=p_from+((v_day-extract(isodow from p_from)::integer+7)%7);
  else
    v_month:=make_date(extract(year from p_from)::integer,extract(month from p_from)::integer,1);
    v_last:=(v_month+interval '1 month'-interval '1 day')::date;
    v_due:=v_month+least(v_day,extract(day from v_last)::integer)-1;
    if v_due<p_from then
      if v_month=date '9999-12-01' then return null; end if;
      v_month:=(v_month+interval '1 month')::date;
      v_last:=(v_month+interval '1 month'-interval '1 day')::date;
      v_due:=v_month+least(v_day,extract(day from v_last)::integer)-1;
    end if;
  end if;
  return case when v_due>date '9999-12-31' then null else v_due end;
end;
$$;
revoke all on function private.nest_first_recurring_date(jsonb,date) from public,anon,authenticated;

create function private.nest_recurring_cycle(p_schedule jsonb,p_from date,p_covered date)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_due date; v_start date; v_through date; v_kind text:=p_schedule->>'kind';
begin
  -- Validate schedule/start even when coverage has exhausted the supported range.
  v_due:=private.nest_first_recurring_date(p_schedule,p_from);
  if p_covered is not null then
    if not isfinite(p_covered) or p_covered<date '0001-01-01' or p_covered>date '9999-12-31' then
      raise exception 'Invalid recurring coverage' using errcode='22023';
    end if;
    if p_covered=date '9999-12-31' then return null; end if;
    if p_covered>=p_from then
      v_due:=private.nest_first_recurring_date(p_schedule,p_covered+1);
    end if;
  end if;
  -- At most one candidate can overlap a prior period after the covered bound.
  for i in 1..2 loop
    if v_due is null then return null; end if;
    if v_kind='weekly' then
      v_start:=v_due+1-extract(isodow from v_due)::integer;
      v_through:=least(v_start+6,date '9999-12-31');
    else
      v_start:=make_date(extract(year from v_due)::integer,extract(month from v_due)::integer,1);
      v_through:=(v_start+interval '1 month'-interval '1 day')::date;
    end if;
    if p_covered is null or v_start>p_covered then
      return jsonb_build_object('key',v_kind||':'||to_char(v_start,'YYYY-MM-DD'),
        'dueOn',to_char(v_due,'YYYY-MM-DD'),'startsOn',to_char(v_start,'YYYY-MM-DD'),
        'through',to_char(v_through,'YYYY-MM-DD'));
    end if;
    if v_through=date '9999-12-31' then return null; end if;
    v_due:=private.nest_first_recurring_date(p_schedule,v_through+1);
  end loop;
  raise exception 'Recurring period unavailable' using errcode='55000';
end;
$$;
revoke all on function private.nest_recurring_cycle(jsonb,date,date) from public,anon,authenticated;
