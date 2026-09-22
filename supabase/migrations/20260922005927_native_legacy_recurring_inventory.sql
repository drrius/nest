-- GATED additive read surface over retained legacy tables. No adoption or writes.
create function private.nest_legacy_recurring_date(p_date date)
returns jsonb language sql stable set search_path='' as $$
  select case when p_date is null then null
    when not isfinite(p_date) then jsonb_build_object('kind','unsupported','reason','non_finite','value',p_date::text)
    when p_date<date '0001-01-01' or p_date>date '9999-12-31' then
      jsonb_build_object('kind','unsupported','reason','out_of_range','value',p_date::text)
    else jsonb_build_object('kind','date','value',to_char(p_date,'YYYY-MM-DD')) end;
$$;
revoke all on function private.nest_legacy_recurring_date(date) from public,anon,authenticated,service_role;
create function private.nest_legacy_recurring_version(p_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select case when not isfinite(p_time) then jsonb_build_object('kind','unsupported','reason','non_finite','value',p_time::text)
    when p_time<timestamptz '0001-01-01 00:00:00+00' or p_time>=timestamptz '10000-01-01 00:00:00+00' then
      jsonb_build_object('kind','unsupported','reason','out_of_range','value',p_time::text)
    else jsonb_build_object('kind','timestamp','value',to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) end;
$$;
revoke all on function private.nest_legacy_recurring_version(timestamptz) from public,anon,authenticated,service_role;
create function private.nest_legacy_recurring_split(p_rule public.recurring_expense_rules)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_shares jsonb;
begin
  perform private.validate_money_allocations(p_rule.household_id,p_rule.amount_cents,p_rule.proposed_allocations);
  if not exists(select 1 from jsonb_array_elements(p_rule.proposed_allocations) a(value)
    where (a.value->>'memberId')::uuid=p_rule.payer_member_id) then
    return jsonb_build_object('kind','needs_review','reason','invalid_split'); end if;
  select jsonb_agg(jsonb_build_object('memberId',(a.value->>'memberId')::uuid,
    'centimes',(a.value->>'allocatedCents')::bigint::text) order by a.ordinality) into v_shares
    from jsonb_array_elements(p_rule.proposed_allocations) with ordinality a(value,ordinality);
  return jsonb_build_object('kind','valid','shares',v_shares);
exception when data_exception or check_violation then
  return jsonb_build_object('kind','needs_review','reason','invalid_split');
end;
$$;
revoke all on function private.nest_legacy_recurring_split(public.recurring_expense_rules) from public,anon,authenticated,service_role;
create function private.nest_legacy_recurring_document(p_rule public.recurring_expense_rules)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_counts jsonb;
begin
  select jsonb_build_object(
    'pending',(count(*) filter(where d.status='pending'))::text,
    'posted',(count(*) filter(where d.status='posted'))::text,
    'dismissed',(count(*) filter(where d.status='dismissed'))::text,
    'postedWithoutEvent',(count(*) filter(where d.status='posted' and e.id is null))::text,
    'unpostedWithEvent',(count(*) filter(where d.status<>'posted' and e.id is not null))::text,
    'unsupportedDates',(count(*) filter(where not isfinite(d.occurred_on) or d.occurred_on<date '0001-01-01' or d.occurred_on>date '9999-12-31'))::text,
    'latestDraftOn',private.nest_legacy_recurring_date(max(d.occurred_on))
  ) into v_counts from public.expense_drafts d left join public.financial_events e
    on e.expense_draft_id=d.id and e.household_id=d.household_id
    where d.household_id=p_rule.household_id and d.recurring_expense_rule_id=p_rule.id;
  return jsonb_build_object('ruleId',p_rule.id,'mode','legacy_draft_only',
    'description',p_rule.description,'amountCentimes',p_rule.amount_cents::text,
    'payerId',p_rule.payer_member_id,'allocations',private.nest_legacy_recurring_split(p_rule),'categoryId',p_rule.category_id,
    'active',p_rule.active,'nextOccurrenceOn',private.nest_legacy_recurring_date(p_rule.next_occurrence_on),
    'updatedAt',private.nest_legacy_recurring_version(p_rule.updated_at),
    'schedule',case when p_rule.schedule_kind='weekly' then jsonb_build_object('kind','weekly','weekday',p_rule.iso_weekday)
      else jsonb_build_object('kind','monthly','dayOfMonth',p_rule.day_of_month) end,
    'drafts',v_counts);
end;
$$;
revoke all on function private.nest_legacy_recurring_document(public.recurring_expense_rules) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_recurring(p_household uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.nest_legacy_recurring_document(r) order by r.id),'[]'::jsonb) into v_rows
    from (select * from public.recurring_expense_rules where household_id=p_household
      and (p_after is null or id>p_after) order by id limit 21) r;
  if jsonb_array_length(v_rows)>20 then v_rows:=v_rows-20; v_next:=(v_rows->19->>'ruleId')::uuid; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'after',p_after,'next',v_next,'rules',v_rows);
end;
$$;
revoke all on function private.nest_read_legacy_recurring(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_recurring(uuid,uuid) to authenticated;
create function public.nest_read_legacy_recurring(p_household uuid,p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_recurring($1,$2); $$;
revoke all on function public.nest_read_legacy_recurring(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_recurring(uuid,uuid) to authenticated;
