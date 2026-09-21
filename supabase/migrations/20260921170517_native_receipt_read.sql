-- GATED: receipt metadata only. Link signing is a separately authorized API action.
create function private.nest_read_receipt(p_household uuid,p_event uuid,p_path text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_path text; v_upload public.household_attachment_uploads; v_metadata jsonb; v_size text; v_target jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if (p_event is null)=(p_path is null) then raise exception 'Choose one receipt target' using errcode='22023'; end if;
  if p_event is not null then
    select receipt_path into v_path from public.financial_events where household_id=p_household and id=p_event;
    if not found then raise exception 'Entry unavailable' using errcode='P0002'; end if;
    v_target:=jsonb_build_object('eventId',p_event);
  else v_path:=p_path; v_target:=jsonb_build_object('receiptPath',p_path);
  end if;
  if v_path is null then return jsonb_build_object('version',1,'householdId',p_household,'target',v_target,'receipt',null); end if;
  if v_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
    or lower(split_part(v_path,'/',1))<>p_household::text then
    raise exception 'Receipt unavailable' using errcode='P0002'; end if;
  select * into v_upload from public.household_attachment_uploads where path=v_path and household_id=p_household;
  if not found or v_upload.state not in ('pending','claimed') then
    raise exception 'Receipt unavailable' using errcode='P0002'; end if;
  if p_event is null and v_upload.uploaded_by<>auth.uid() and not exists(
    select 1 from public.financial_events where household_id=p_household and receipt_path=v_path) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  select metadata into v_metadata from storage.objects where bucket_id='household-files' and name=v_path;
  if not found or v_metadata->>'mimetype' is distinct from v_upload.content_type then
    raise exception 'Receipt unavailable' using errcode='P0002'; end if;
  v_size:=v_metadata->>'size';
  if v_size is not null and v_size !~ '^(0|[1-9][0-9]{0,15})$' then v_size:=null; end if;
  if v_size::numeric>9007199254740991 then v_size:=null; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'target',v_target,
    'receipt',jsonb_build_object('path',v_path,'contentType',v_upload.content_type,'bytes',v_size));
end;
$$;
revoke all on function private.nest_read_receipt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.nest_read_receipt(uuid,uuid,text) to authenticated;
create function public.nest_read_receipt(p_household uuid,p_event uuid default null,p_path text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_receipt($1,$2,$3);
$$;
revoke all on function public.nest_read_receipt(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nest_read_receipt(uuid,uuid,text) to authenticated;
