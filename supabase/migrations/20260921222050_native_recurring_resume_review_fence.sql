-- GATED: serialize private resume review with decision/execution before reporting date expiry.
-- A native client may retire a staged approval only after this read proves its date
-- has passed and no earlier operation can still commit under that date.
create or replace function private.nest_read_recurring_resume_approval(p_household uuid,p_approval uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_operation uuid; v_result jsonb; v_today date;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select invocation_id into v_operation from public.nest_action_approvals
    where id=p_approval and household_id=p_household and actor_id=v_actor
      and command='recurring.resume' and command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-state-operation:'||v_actor::text||':'||p_household::text||':'||v_operation::text,0));
  -- clock_timestamp is sampled AFTER the fence, not the statement/transaction start.
  v_today:=(clock_timestamp() at time zone 'Europe/Zurich')::date;
  select jsonb_build_object('version',1,'actorId',a.actor_id,'householdId',a.household_id,'approval',
    jsonb_build_object('id',a.id,'operationId',a.invocation_id,'change',a.payload,'status',a.status,
      'reviewedOn',to_char(v_today,'YYYY-MM-DD'),
      'expiresAt',to_char(timezone('UTC',a.expires_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'receipt',r.result)) into v_result
    from public.nest_action_approvals a left join public.nest_recurring_state_receipts r
      on r.actor_id=a.actor_id and r.household_id=a.household_id and r.operation_id=a.invocation_id
        and r.result->>'approvalId'=a.id::text
    where a.id=p_approval and a.household_id=p_household and a.actor_id=v_actor
      and a.command='recurring.resume' and a.command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke all on function private.nest_read_recurring_resume_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_recurring_resume_approval(uuid,uuid) to authenticated;
create or replace function public.nest_read_recurring_resume_approval(p_household uuid,p_approval uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_read_recurring_resume_approval($1,$2);
$$;
revoke all on function public.nest_read_recurring_resume_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_recurring_resume_approval(uuid,uuid) to authenticated;
