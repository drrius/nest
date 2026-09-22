create or replace function private.next_recurring_expense_date(
  p_schedule_kind text,
  p_current_date date,
  p_iso_weekday integer,
  p_day_of_month integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_candidate date;
  weekday_offset integer;
  candidate_year integer;
  candidate_month integer;
  this_month date;
  next_month date;
  final_day integer;
begin
  if p_schedule_kind = 'weekly' then
    if p_iso_weekday is null or p_iso_weekday not between 1 and 7 then
      raise exception 'weekly schedules require an ISO weekday from 1 to 7'
        using errcode = '22023';
    end if;
    first_candidate := p_current_date + 1;
    weekday_offset := (
      p_iso_weekday - extract(isodow from first_candidate)::integer + 7
    ) % 7;
    return first_candidate + weekday_offset;
  end if;
  if p_schedule_kind <> 'monthly' then
    raise exception 'unknown recurring schedule kind %', p_schedule_kind
      using errcode = '22023';
  end if;
  if p_day_of_month is null or p_day_of_month not between 1 and 31 then
    raise exception 'monthly schedules require a day of month from 1 to 31'
      using errcode = '22023';
  end if;

  candidate_year := extract(year from p_current_date)::integer;
  candidate_month := extract(month from p_current_date)::integer;
  final_day := extract(
    day from (
      make_date(candidate_year, candidate_month, 1) + interval '1 month - 1 day'
    )::date
  )::integer;
  this_month := make_date(
    candidate_year,
    candidate_month,
    least(p_day_of_month, final_day)
  );
  if this_month > p_current_date then
    return this_month;
  end if;

  next_month := (date_trunc('month', p_current_date) + interval '1 month')::date;
  final_day := extract(
    day from (next_month + interval '1 month - 1 day')::date
  )::integer;
  return make_date(
    extract(year from next_month)::integer,
    extract(month from next_month)::integer,
    least(p_day_of_month, final_day)
  );
end;
$$;
