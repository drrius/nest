-- GATED additive read surface over retained legacy tables. No adoption or writes.
create function private.nest_legacy_recurring_document(p_rule public.recurring_expense_rules)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_counts jsonb; v_allocations jsonb;
begin
  select jsonb_build_object(
    'pending',(count(*) filter(where d.status='pending'))::text,
    'posted',(count(*) filter(where d.status='posted'))::text,
    'dismissed',(count(*) filter(where d.status='dismissed'))::text,
    'postedWithoutEvent',(count(*) filter(where d.status='posted' and e.id is null))::text,
    'unpostedWithEvent',(count(*) filter(where d.status<>'posted' and e.id is not null))::text,
    'latestDraftOn',to_char(max(d.occurred_on),'YYYY-MM-DD')
  ) into v_counts from public.expense_drafts d left join public.financial_events e
    on e.expense_draft_id=d.id and e.household_id=d.household_id
    where d.household_id=p_rule.household_id and d.recurring_expense_rule_id=p_rule.id;
  select coalesce(jsonb_agg(jsonb_build_object('memberId',(a.value->>'memberId')::uuid,
    'centimes',a.value->>'allocatedCents') order by a.ordinality),'[]'::jsonb) into v_allocations
    from jsonb_array_elements(p_rule.proposed_allocations) with ordinality a(value,ordinality);
  return jsonb_build_object('ruleId',p_rule.id,'mode','legacy_draft_only',
    'description',p_rule.description,'amountCentimes',p_rule.amount_cents::text,
    'payerId',p_rule.payer_member_id,'allocations',v_allocations,'categoryId',p_rule.category_id,
    'active',p_rule.active,'nextOccurrenceOn',to_char(p_rule.next_occurrence_on,'YYYY-MM-DD'),
    'updatedAt',to_char(p_rule.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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
