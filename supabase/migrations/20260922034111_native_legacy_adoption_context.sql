-- GATED read-only adoption review. No source rows, mapping or mandate are written.
create function private.nest_legacy_adoption_history(p_rule public.recurring_expense_rules)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_fingerprint text; v_latest date; v_unsupported boolean; v_through date;
begin
  select encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(
    jsonb_build_object('draft',to_jsonb(d),'event',to_jsonb(e))::text,'UTF8')),'hex'),'' order by d.id),''),'UTF8')),'hex'),
    max(greatest(d.occurred_on,e.occurred_on)),
    coalesce(bool_or(not isfinite(d.occurred_on) or d.occurred_on<date '0001-01-01' or d.occurred_on>date '9999-12-31'
      or (e.id is not null and (not isfinite(e.occurred_on) or e.occurred_on<date '0001-01-01' or e.occurred_on>date '9999-12-31'))),false)
    into v_fingerprint,v_latest,v_unsupported
    from public.expense_drafts d left join public.financial_events e on e.household_id=d.household_id and e.expense_draft_id=d.id
    where d.household_id=p_rule.household_id and d.recurring_expense_rule_id=p_rule.id;
  if v_latest is not null and not v_unsupported then
    -- Old drafts retain no immutable cadence revision. Conservatively cover both
    -- supported period shapes so a later cadence edit cannot duplicate an old obligation.
    v_through:=greatest(v_latest+(7-extract(isodow from v_latest)::integer),
      (date_trunc('month',v_latest::timestamp)+interval '1 month - 1 day')::date);
    v_unsupported:=v_through>date '9999-12-31';
  end if;
  return jsonb_build_object('fingerprint',v_fingerprint,'unsupported',v_unsupported,
    'coveredThrough',case when v_unsupported then null else to_char(v_through,'YYYY-MM-DD') end);
end;
$$;
revoke all on function private.nest_legacy_adoption_history(public.recurring_expense_rules) from public,anon,authenticated,service_role;
create function private.nest_legacy_adoption_review(p_rule public.recurring_expense_rules)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_rule jsonb; v_history jsonb; v_mapping jsonb; v_reasons jsonb:='[]'; v_collision boolean;
begin
  v_rule:=private.nest_legacy_recurring_document(p_rule);
  v_history:=private.nest_legacy_adoption_history(p_rule);
  select jsonb_build_object('nativeRuleId',native_rule_id,'authorizedBy',authorized_by,
    'authorizedAt',to_char(authorized_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) into v_mapping
    from private.nest_legacy_recurring_adoptions where household_id=p_rule.household_id and legacy_rule_id=p_rule.id;
  select exists(select 1 from public.nest_recurring_rules where household_id=p_rule.household_id and id=p_rule.id) into v_collision;
  if v_mapping is not null then v_reasons:=v_reasons||'"already_adopted"'::jsonb;
  elsif v_collision then v_reasons:=v_reasons||'"native_identity_in_use"'::jsonb; end if;
  if v_rule->'drafts'->>'pending'<>'0' then v_reasons:=v_reasons||'"pending_drafts"'::jsonb; end if;
  if v_rule->'drafts'->>'postedWithoutEvent'<>'0' or v_rule->'drafts'->>'unpostedWithEvent'<>'0' then
    v_reasons:=v_reasons||'"unreconciled_history"'::jsonb; end if;
  if (v_history->>'unsupported')::boolean then v_reasons:=v_reasons||'"unsupported_history_dates"'::jsonb; end if;
  return jsonb_build_object('version',1,'householdId',p_rule.household_id,'rule',v_rule,
    'reviewToken',encode(sha256(convert_to(jsonb_build_object('rule',to_jsonb(p_rule),'history',v_history,
      'mapping',v_mapping,'nativeIdentityInUse',v_collision)::text,'UTF8')),'hex'),
    'coveredThrough',v_history->'coveredThrough','blockers',v_reasons,'adoption',v_mapping);
end;
$$;
revoke all on function private.nest_legacy_adoption_review(public.recurring_expense_rules) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_adoption_context(p_household uuid,p_rule uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rule public.recurring_expense_rules;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_rule from public.recurring_expense_rules where household_id=p_household and id=p_rule;
  if not found then raise exception 'Legacy rule unavailable' using errcode='42501'; end if;
  return private.nest_legacy_adoption_review(v_rule);
end;
$$;
revoke all on function private.nest_read_legacy_adoption_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_adoption_context(uuid,uuid) to authenticated;
create function public.nest_read_legacy_adoption_context(p_household uuid,p_rule uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_adoption_context($1,$2); $$;
revoke all on function public.nest_read_legacy_adoption_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_adoption_context(uuid,uuid) to authenticated;
