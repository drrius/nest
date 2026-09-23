-- Gated server-only progress. No timer or provider dispatch is activated.
create table private.nest_summary_push_scan_checkpoint (
  singleton boolean primary key default true check(singleton),
  revision uuid not null default gen_random_uuid(),
  cursor jsonb
);
insert into private.nest_summary_push_scan_checkpoint(singleton) values(true);
alter table private.nest_summary_push_scan_checkpoint enable row level security;
revoke all on private.nest_summary_push_scan_checkpoint from public,anon,authenticated,service_role;

create function private.nest_read_summary_push_checkpoint()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('version',1,'revision',revision,'after',cursor)
    from private.nest_summary_push_scan_checkpoint where singleton;
$$;
revoke all on function private.nest_read_summary_push_checkpoint() from public,anon,authenticated,service_role;
grant execute on function private.nest_read_summary_push_checkpoint() to service_role;
create function public.nest_read_summary_push_checkpoint()
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_summary_push_checkpoint(); $$;
revoke all on function public.nest_read_summary_push_checkpoint() from public,anon,authenticated,service_role;
grant execute on function public.nest_read_summary_push_checkpoint() to service_role;

create function private.nest_save_summary_push_checkpoint(p_revision uuid,p_after jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.nest_summary_push_scan_checkpoint; v_due timestamptz; v_cursor jsonb:=null;
begin
  if p_revision is null then raise exception 'Missing checkpoint revision' using errcode='22023'; end if;
  if p_after is not null and p_after<>'null'::jsonb then
    if jsonb_typeof(p_after) is distinct from 'object' or octet_length(p_after::text)>1024
      or not(p_after ?& array['dueAt','outboxId','installationId'])
      or p_after-array['dueAt','outboxId','installationId']<>'{}'::jsonb
      or jsonb_typeof(p_after->'dueAt') is distinct from 'string' then
      raise exception 'Invalid checkpoint cursor' using errcode='22023'; end if;
    v_due:=(p_after->>'dueAt')::timestamptz;
    if not isfinite(v_due) then raise exception 'Invalid checkpoint instant' using errcode='22023'; end if;
    v_cursor:=jsonb_build_object('dueAt',v_due,
      'outboxId',private.nest_expense_uuid(p_after->'outboxId',false),
      'installationId',private.nest_expense_uuid(p_after->'installationId',false));
  end if;
  select * into strict v_row from private.nest_summary_push_scan_checkpoint where singleton for update;
  if v_row.revision<>p_revision then raise exception 'Checkpoint advanced' using errcode='40001'; end if;
  update private.nest_summary_push_scan_checkpoint set revision=gen_random_uuid(),cursor=v_cursor where singleton;
  return private.nest_read_summary_push_checkpoint();
end;
$$;
revoke all on function private.nest_save_summary_push_checkpoint(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_summary_push_checkpoint(uuid,jsonb) to service_role;
create function public.nest_save_summary_push_checkpoint(p_revision uuid,p_after jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_summary_push_checkpoint($1,$2); $$;
revoke all on function public.nest_save_summary_push_checkpoint(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_summary_push_checkpoint(uuid,jsonb) to service_role;
