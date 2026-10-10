-- Retained deadlines may exceed Postgres's date range. Preserve the record and
-- omit only an unrepresentable deadline; do not let it break every attention read.
create function private.nest_legacy_attention_deadline(p_date date,p_days integer)
returns date language plpgsql immutable strict security invoker set search_path='' as $$
begin
  return p_date-p_days;
exception when datetime_field_overflow then
  return null;
end;
$$;
revoke all on function private.nest_legacy_attention_deadline(date,integer) from public,anon;
grant execute on function private.nest_legacy_attention_deadline(date,integer) to authenticated,service_role;

create or replace function public.list_home_attention_records(
  p_kind text,p_query text default '',p_page integer default 0,
  p_today date default (now() at time zone 'Europe/Zurich')::date
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb; v_until date;
begin
  if p_kind is null or p_kind not in ('inventory','commitments')
    or p_page is null or p_page<0 or p_page>10000 or p_today is null or not isfinite(p_today) then
    raise exception 'Invalid attention query' using errcode='23514';
  end if;
  v_until:=private.nest_legacy_attention_deadline(p_today,-30);
  if v_until is null then raise exception 'Invalid attention query' using errcode='23514'; end if;
  with candidates as (
    select a.id,a.warranty_until as deadline,to_jsonb(a) as payload
    from public.household_assets a
    where p_kind='inventory' and a.archived_at is null
      and a.warranty_until between p_today and v_until
      and strpos(lower(a.title),lower(left(coalesce(p_query,''),160)))>0
    union all
    select c.id,private.nest_legacy_attention_deadline(c.renewal_on,c.notice_days) as deadline,to_jsonb(c) as payload
    from public.household_commitments c
    where p_kind='commitments' and c.archived_at is null and c.status<>'ended'
      and private.nest_legacy_attention_deadline(c.renewal_on,c.notice_days)<=v_until
      and strpos(lower(c.title),lower(left(coalesce(p_query,''),160)))>0
  ), page_rows as (
    select * from candidates order by deadline,id limit 20 offset p_page*20
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(payload order by deadline,id) from page_rows),'[]'::jsonb),
    'count',(select count(*) from candidates)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_home_attention_records(text,text,integer,date) from public,anon;
grant execute on function public.list_home_attention_records(text,text,integer,date) to authenticated,service_role;
