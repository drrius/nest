-- GATED read-only draft reconciliation. Preserve original draft bodies and event links.
create function private.nest_legacy_draft_split(p_draft public.expense_drafts)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_shares jsonb;
begin
  if p_draft.amount_cents is null or p_draft.payer_member_id is null then
    return jsonb_build_object('kind','needs_review','reason','invalid_split'); end if;
  perform private.validate_money_allocations(p_draft.household_id,p_draft.amount_cents,p_draft.proposed_allocations);
  if not exists(select 1 from jsonb_array_elements(p_draft.proposed_allocations) a(value)
    where (a.value->>'memberId')::uuid=p_draft.payer_member_id) then
    return jsonb_build_object('kind','needs_review','reason','invalid_split'); end if;
  select jsonb_agg(jsonb_build_object('memberId',(a.value->>'memberId')::uuid,
    'centimes',(a.value->>'allocatedCents')::bigint::text) order by a.ordinality) into v_shares
    from jsonb_array_elements(p_draft.proposed_allocations) with ordinality a(value,ordinality);
  return jsonb_build_object('kind','valid','shares',v_shares);
exception when data_exception or check_violation then
  return jsonb_build_object('kind','needs_review','reason','invalid_split');
end;
$$;
revoke all on function private.nest_legacy_draft_split(public.expense_drafts) from public,anon,authenticated,service_role;
create function private.nest_legacy_draft_document(p_draft public.expense_drafts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('draftId',p_draft.id,'ruleId',p_draft.recurring_expense_rule_id,
    'description',p_draft.description,'amountCentimes',p_draft.amount_cents::text,
    'payerId',p_draft.payer_member_id,'allocations',private.nest_legacy_draft_split(p_draft),
    'categoryId',p_draft.category_id,'sourceKind',p_draft.source_kind,'shoppingSessionId',p_draft.shopping_session_id,
    'occurredOn',private.nest_legacy_recurring_date(p_draft.occurred_on),'status',p_draft.status,
    'updatedAt',private.nest_legacy_recurring_version(p_draft.updated_at),
    'eventId',(select e.id from public.financial_events e where e.household_id=p_draft.household_id and e.expense_draft_id=p_draft.id));
$$;
revoke all on function private.nest_legacy_draft_document(public.expense_drafts) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_drafts(p_household uuid,p_rule uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.recurring_expense_rules where household_id=p_household and id=p_rule;
  if not found then raise exception 'Legacy rule unavailable' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.nest_legacy_draft_document(d) order by d.id),'[]'::jsonb) into v_rows
    from (select * from public.expense_drafts where household_id=p_household and recurring_expense_rule_id=p_rule
      and (p_after is null or id>p_after) order by id limit 21) d;
  if jsonb_array_length(v_rows)>20 then v_rows:=v_rows-20; v_next:=(v_rows->19->>'draftId')::uuid; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'ruleId',p_rule,'after',p_after,'next',v_next,'drafts',v_rows);
end;
$$;
revoke all on function private.nest_read_legacy_drafts(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_drafts(uuid,uuid,uuid) to authenticated;
create function public.nest_read_legacy_drafts(p_household uuid,p_rule uuid,p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_drafts($1,$2,$3); $$;
revoke all on function public.nest_read_legacy_drafts(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_drafts(uuid,uuid,uuid) to authenticated;
