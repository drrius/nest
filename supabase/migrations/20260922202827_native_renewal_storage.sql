-- GATED: native renewal records only. No legacy migration, financial write or reminder dispatch.
create table public.nest_renewals (
  household_id uuid not null references public.households(id),
  id uuid not null, revision uuid not null,
  title text not null, renewal_on date not null, notice_days integer not null check(notice_days between 0 and 730),
  responsible_id uuid, recurring_rule_id uuid, removed boolean not null default false,
  primary key(household_id,id),
  foreign key(household_id,responsible_id) references public.household_members(household_id,user_id),
  foreign key(household_id,recurring_rule_id) references public.nest_recurring_rules(household_id,id),
  check(length(title) between 1 and 160),
  check(renewal_on between date '0001-01-01' and date '9999-12-31'),
  check(renewal_on-notice_days >= date '0001-01-01')
);
alter table public.nest_renewals enable row level security;
revoke all on public.nest_renewals from public,anon,authenticated,service_role;
grant select on public.nest_renewals to authenticated;
create policy nest_renewals_household_read on public.nest_renewals for select to authenticated
  using((select private.is_household_member(household_id)));
create table private.nest_renewal_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, check((request_hash is null)=(result is null)),
  primary key(actor_id,household_id,operation_id)
);
revoke all on private.nest_renewal_operations from public,anon,authenticated,service_role;
create trigger nest_renewal_operations_immutable before update or delete on private.nest_renewal_operations
  for each row execute function private.reject_financial_history_change();

create function private.nest_renewal_fields(p_fields jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_date date; v_notice integer; v_title text;
begin
  if p_fields is null or jsonb_typeof(p_fields) is distinct from 'object' or octet_length(p_fields::text)>4096
    or not(p_fields ?& array['title','renewalOn','noticeDays','responsibleId','recurringRuleId'])
    or p_fields-array['title','renewalOn','noticeDays','responsibleId','recurringRuleId']<>'{}'::jsonb
    or jsonb_typeof(p_fields->'title') is distinct from 'string'
    or jsonb_typeof(p_fields->'renewalOn') is distinct from 'string'
    or jsonb_typeof(p_fields->'noticeDays') is distinct from 'number' then
    raise exception 'Invalid renewal fields' using errcode='22023'; end if;
  v_title:=p_fields->>'title';
  if length(v_title) not between 1 and 160 or v_title<>btrim(v_title,
    E' \t\n\r\f'||chr(11)||U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') then
    raise exception 'Invalid renewal title' using errcode='22023'; end if;
  if (p_fields->>'renewalOn')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_fields->>'noticeDays')!~'^[0-9]+$' then
    raise exception 'Invalid renewal date or lead time' using errcode='22023'; end if;
  v_date:=(p_fields->>'renewalOn')::date; v_notice:=(p_fields->>'noticeDays')::integer;
  if to_char(v_date,'YYYY-MM-DD')<>p_fields->>'renewalOn' or v_date<date '0001-01-01'
    or v_notice not between 0 and 730 or v_date-v_notice<date '0001-01-01' then
    raise exception 'Unsupported renewal deadline' using errcode='22023'; end if;
  return p_fields||jsonb_build_object('responsibleId',private.nest_expense_uuid(p_fields->'responsibleId',true),
    'recurringRuleId',private.nest_expense_uuid(p_fields->'recurringRuleId',true));
end;
$$;
revoke all on function private.nest_renewal_fields(jsonb) from public,anon,authenticated,service_role;
create function private.nest_renewal_json(p_row public.nest_renewals)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('renewalId',p_row.id,'revision',p_row.revision,'removed',p_row.removed,
    'cancellationOn',to_char(p_row.renewal_on-p_row.notice_days,'YYYY-MM-DD'),'fields',jsonb_build_object(
      'title',p_row.title,'renewalOn',to_char(p_row.renewal_on,'YYYY-MM-DD'),'noticeDays',p_row.notice_days,
      'responsibleId',p_row.responsible_id,'recurringRuleId',p_row.recurring_rule_id));
$$;
revoke all on function private.nest_renewal_json(public.nest_renewals) from public,anon,authenticated,service_role;

create function private.nest_change_renewal(p_household uuid,p_operation uuid,p_input jsonb,p_remove boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_expected uuid; v_fields jsonb; v_hash bytea;
  v_prior private.nest_renewal_operations; v_row public.nest_renewals; v_result jsonb; v_keys text[];
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_remove is null then raise exception 'Invalid renewal operation' using errcode='22023'; end if;
  v_keys:=case when p_remove then array['renewalId','expectedRevision'] else array['renewalId','expectedRevision','fields'] end;
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& v_keys)
    or p_input-v_keys<>'{}'::jsonb then raise exception 'Invalid renewal command' using errcode='22023'; end if;
  v_id:=private.nest_expense_uuid(p_input->'renewalId',false)::uuid;
  v_expected:=private.nest_expense_uuid(p_input->'expectedRevision',not p_remove)::uuid;
  if not p_remove then v_fields:=private.nest_renewal_fields(p_input->'fields'); end if;
  v_hash:=sha256(convert_to(jsonb_build_object('renewalId',v_id,'expectedRevision',v_expected,'fields',v_fields,'remove',p_remove)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtextextended('nest:renewal-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_renewal_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Renewal operation abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Renewal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:renewal:'||p_household::text||':'||v_id::text,0));
  select * into v_row from public.nest_renewals where household_id=p_household and id=v_id for update;
  if v_row.revision is distinct from v_expected or coalesce(v_row.removed,false) then
    raise exception 'Renewal changed' using errcode='40001'; end if;
  if p_remove then
    update public.nest_renewals set removed=true,revision=gen_random_uuid() where household_id=p_household and id=v_id returning * into v_row;
  else
    if v_fields->>'responsibleId' is not null then
      perform 1 from public.household_members where household_id=p_household and user_id=(v_fields->>'responsibleId')::uuid for key share;
      if not found then raise exception 'Responsible member unavailable' using errcode='42501'; end if;
    end if;
    if v_fields->>'recurringRuleId' is not null then
      perform 1 from public.nest_recurring_rules where household_id=p_household and id=(v_fields->>'recurringRuleId')::uuid for key share;
      if not found then raise exception 'Recurring rule unavailable' using errcode='42501'; end if;
    end if;
    insert into public.nest_renewals(household_id,id,revision,title,renewal_on,notice_days,responsible_id,recurring_rule_id)
      values(p_household,v_id,gen_random_uuid(),v_fields->>'title',(v_fields->>'renewalOn')::date,(v_fields->>'noticeDays')::integer,
        (v_fields->>'responsibleId')::uuid,(v_fields->>'recurringRuleId')::uuid)
      on conflict(household_id,id) do update set revision=excluded.revision,title=excluded.title,renewal_on=excluded.renewal_on,
        notice_days=excluded.notice_days,responsible_id=excluded.responsible_id,recurring_rule_id=excluded.recurring_rule_id returning * into v_row;
  end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'action',case when p_remove then 'removed' else 'saved' end,'renewal',private.nest_renewal_json(v_row),
    'command',jsonb_build_object('operationId',p_operation,'renewalId',v_id,'expectedRevision',v_expected)||
      case when p_remove then '{}'::jsonb else jsonb_build_object('fields',v_fields) end);
  insert into private.nest_renewal_operations values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_change_renewal(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
create function public.nest_save_renewal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_change_renewal($1,$2,$3,false); $$;
create function public.nest_remove_renewal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_change_renewal($1,$2,$3,true); $$;
revoke all on function public.nest_save_renewal(uuid,uuid,jsonb),public.nest_remove_renewal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_renewal(uuid,uuid,jsonb),public.nest_remove_renewal(uuid,uuid,jsonb) to authenticated;

create function public.nest_read_renewal(p_household uuid,p_renewal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.nest_renewals;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_row from public.nest_renewals where household_id=p_household and id=p_renewal;
  if not found then raise exception 'Renewal unavailable' using errcode='42501'; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'renewal',private.nest_renewal_json(v_row));
end;
$$;
create function public.nest_list_renewals(p_household uuid,p_after uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(private.nest_renewal_json(r) order by r.id),'[]'::jsonb) into v_rows
    from (select * from public.nest_renewals where household_id=p_household and not removed
      and (p_after is null or id>p_after) order by id limit 51) r;
  if jsonb_array_length(v_rows)>50 then
    v_rows:=v_rows-50; v_next:=(v_rows->49->>'renewalId')::uuid;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'after',p_after,'next',v_next,'renewals',v_rows);
end;
$$;
revoke all on function public.nest_read_renewal(uuid,uuid),public.nest_list_renewals(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_renewal(uuid,uuid),public.nest_list_renewals(uuid,uuid) to authenticated;

create function private.nest_recover_renewal(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row private.nest_renewal_operations; v_status text:='unresolved';
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_cancel is null then raise exception 'Invalid renewal operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:renewal-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_cancel then
    insert into private.nest_renewal_operations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  select * into v_row from private.nest_renewal_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then v_status:=case when v_row.result is null then 'cancelled' else 'recorded' end; end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',v_status,'receipt',v_row.result);
end;
$$;
revoke all on function private.nest_recover_renewal(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.nest_read_renewal_operation(p_household uuid,p_operation uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select private.nest_recover_renewal($1,$2,false); $$;
create function public.nest_cancel_renewal_operation(p_household uuid,p_operation uuid)
returns jsonb language sql volatile security definer set search_path='' as $$ select private.nest_recover_renewal($1,$2,true); $$;
revoke all on function public.nest_read_renewal_operation(uuid,uuid),public.nest_cancel_renewal_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_renewal_operation(uuid,uuid),public.nest_cancel_renewal_operation(uuid,uuid) to authenticated;
