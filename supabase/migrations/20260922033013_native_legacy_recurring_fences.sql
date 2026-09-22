-- GATED: adoption identity and old-writer fences only. This creates no adoption or mandate.
create table private.nest_legacy_recurring_adoptions (
  household_id uuid not null,
  legacy_rule_id uuid not null,
  native_rule_id uuid not null,
  source_review_token text not null check(source_review_token ~ '^[0-9a-f]{64}$'),
  authorized_by uuid not null,
  authorized_at timestamptz not null default clock_timestamp(),
  primary key(household_id,legacy_rule_id),
  unique(household_id,native_rule_id),
  check(native_rule_id=legacy_rule_id),
  foreign key(household_id,legacy_rule_id) references public.recurring_expense_rules(household_id,id),
  foreign key(household_id,native_rule_id) references public.nest_recurring_rules(household_id,id),
  foreign key(household_id,authorized_by) references public.household_members(household_id,user_id)
);
revoke all on private.nest_legacy_recurring_adoptions from public,anon,authenticated,service_role;
create trigger nest_legacy_recurring_adoptions_immutable before update or delete on private.nest_legacy_recurring_adoptions
  for each row execute function private.reject_financial_history_change();

create function private.nest_assert_legacy_rule_open(p_household uuid,p_rule uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if p_rule is null then return; end if;
  -- Old functions acquire a draft/rule row before entering this trigger. Waiting
  -- for the adoption key could invert that order; fail the old transaction instead.
  if not pg_try_advisory_xact_lock(hashtextextended('nest:legacy-adoption:'||p_household::text||':'||p_rule::text,0)) then
    raise exception 'Recurring source is being reviewed; reload and retry' using errcode='40001'; end if;
  -- Adoption must update this row before inserting the immutable mapping. Locking
  -- it forces stale REPEATABLE READ writers to serialize, not miss a newer mapping.
  perform 1 from public.recurring_expense_rules where household_id=p_household and id=p_rule for share;
  if exists(select 1 from private.nest_legacy_recurring_adoptions
    where household_id=p_household and legacy_rule_id=p_rule) then
    raise exception 'Legacy rule adopted; use the native recurring rule' using errcode='55000'; end if;
end;
$$;
revoke all on function private.nest_assert_legacy_rule_open(uuid,uuid) from public,anon,authenticated,service_role;
create function private.nest_guard_legacy_recurring_write()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  perform private.nest_assert_legacy_rule_open(old.household_id,old.id);
  if tg_op='DELETE' then return old; end if;
  if new.id is distinct from old.id or new.household_id is distinct from old.household_id then
    perform private.nest_assert_legacy_rule_open(new.household_id,new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.nest_guard_legacy_recurring_write() from public,anon,authenticated,service_role;
create trigger nest_legacy_recurring_write_fence before update or delete on public.recurring_expense_rules
  for each row execute function private.nest_guard_legacy_recurring_write();
create function private.nest_guard_legacy_draft_write()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then
    perform private.nest_assert_legacy_rule_open(old.household_id,old.recurring_expense_rule_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  perform private.nest_assert_legacy_rule_open(new.household_id,new.recurring_expense_rule_id);
  return new;
end;
$$;
revoke all on function private.nest_guard_legacy_draft_write() from public,anon,authenticated,service_role;
create trigger nest_legacy_draft_write_fence before insert or update or delete on public.expense_drafts
  for each row execute function private.nest_guard_legacy_draft_write();
