-- GATED: records cleanup intent/tombstones only. Delete actual bytes through Storage API.
create function private.nest_cleanup_receipt_upload(p_household uuid,p_input jsonb,p_finish boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_path text; v_stored boolean; v_created integer:=0; v_registry_created integer;
  v_intent private.nest_receipt_upload_intents; v_upload public.household_attachment_uploads;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_finish is null then raise exception 'Invalid cleanup phase' using errcode='22023'; end if;
  v_input:=private.nest_receipt_upload_input(p_input);
  v_path:=p_household::text||'/receipts/'||(v_input->>'uploadId')||
    case when v_input->>'contentType'='image/jpeg' then '.jpg' else '.pdf' end;
  -- A begin request may arrive before an interrupted uploader reserves its identity.
  -- Reserve a tombstone now so that delayed reservation/insertion cannot resurrect it.
  if not p_finish then
    insert into private.nest_receipt_upload_intents(household_id,upload_id,uploaded_by,path,sha256,bytes,content_type)
      values(p_household,(v_input->>'uploadId')::uuid,auth.uid(),v_path,v_input->>'sha256',
        (v_input->>'bytes')::integer,v_input->>'contentType') on conflict do nothing;
    get diagnostics v_created=row_count;
  end if;
  select * into v_intent from private.nest_receipt_upload_intents
    where household_id=p_household and upload_id=(v_input->>'uploadId')::uuid for update;
  if not found or v_intent.uploaded_by<>auth.uid() then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if v_intent.path<>v_path or v_intent.sha256<>v_input->>'sha256'
    or v_intent.bytes<>(v_input->>'bytes')::integer or v_intent.content_type<>v_input->>'contentType' then
    raise exception 'Upload identity changed' using errcode='40001'; end if;
  if not p_finish then
    -- Never adopt a pre-existing legacy path lacking this immutable native identity.
    -- A registry inserted by native reservation has the same owner and metadata.
    insert into public.household_attachment_uploads(path,household_id,uploaded_by,content_type)
      values(v_path,p_household,auth.uid(),v_intent.content_type) on conflict do nothing;
    get diagnostics v_registry_created=row_count;
    if v_created=1 and v_registry_created=0 then
      raise exception 'Existing upload has no content identity' using errcode='40001'; end if;
  end if;
  select * into v_upload from public.household_attachment_uploads where path=v_path for update;
  if not found or v_upload.uploaded_by<>auth.uid() or v_upload.household_id<>p_household
    or v_upload.content_type<>v_intent.content_type then
    raise exception 'Upload unavailable' using errcode='P0002'; end if;
  select exists(select 1 from storage.objects where bucket_id='household-files' and name=v_path) into v_stored;
  if v_upload.state='claimed' then
    return jsonb_build_object('version',1,'householdId',p_household,'uploadId',v_intent.upload_id,
      'path',v_path,'status','claimed');
  end if;
  if p_finish then
    if v_upload.state not in ('deleting','deleted') or v_stored then
      raise exception 'Cleanup not complete' using errcode='40001'; end if;
    update public.household_attachment_uploads set state='deleted' where path=v_path;
  else
    update public.household_attachment_uploads set state=case when v_stored then 'deleting' else 'deleted' end
      where path=v_path;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'uploadId',v_intent.upload_id,
    'path',v_path,'status',case when p_finish or not v_stored then 'deleted' else 'deleting' end);
end;
$$;
revoke all on function private.nest_cleanup_receipt_upload(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function private.nest_cleanup_receipt_upload(uuid,jsonb,boolean) to authenticated;
create function public.nest_cleanup_receipt_upload(p_household uuid,p_input jsonb,p_finish boolean)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_cleanup_receipt_upload($1,$2,$3);
$$;
revoke all on function public.nest_cleanup_receipt_upload(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.nest_cleanup_receipt_upload(uuid,jsonb,boolean) to authenticated;
