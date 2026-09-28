-- Local fixture prototype; not deployed or included in migration history yet.
create table private.nest_ai_cancelled_turns (
  conversation_id uuid not null references public.nest_ai_conversations(id),
  operation_id uuid not null,
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  primary key(conversation_id,operation_id)
);
revoke all on private.nest_ai_cancelled_turns from public,anon,authenticated;

create function private.nest_cancel_unstarted_ai_turn(p_household uuid,p_conversation uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_operation is null or p_conversation is null then
    raise exception 'Invalid cancellation' using errcode='22023';
  end if;
  perform private.nest_lock_ai_conversation(p_household,p_conversation);
  if exists(select 1 from public.nest_ai_turns where conversation_id=p_conversation and operation_id=p_operation) then
    return jsonb_build_object('cancelled',false);
  end if;
  insert into private.nest_ai_cancelled_turns values(p_conversation,p_operation,auth.uid(),p_household)
    on conflict do nothing;
  return jsonb_build_object('cancelled',true);
end;
$$;
revoke all on function private.nest_cancel_unstarted_ai_turn(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_cancel_unstarted_ai_turn(uuid,uuid,uuid) to authenticated;
create function public.nest_cancel_unstarted_ai_turn(p_household uuid,p_conversation uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_cancel_unstarted_ai_turn($1,$2,$3);
$$;
revoke all on function public.nest_cancel_unstarted_ai_turn(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_cancel_unstarted_ai_turn(uuid,uuid,uuid) to authenticated;

do $patch$
declare definition text; marker text := 'v_row:=private.nest_lock_ai_conversation(p_household,p_conversation);';
begin
  definition:=pg_get_functiondef('private.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb)'::regprocedure);
  if strpos(definition,marker)=0 then raise exception 'Missing turn lock'; end if;
  execute replace(definition,marker,marker || '
  if exists(select 1 from private.nest_ai_cancelled_turns where conversation_id=p_conversation and operation_id=p_operation) then
    raise exception ''AI turn cancelled'' using errcode=''PT412'';
  end if;');
end;
$patch$;
