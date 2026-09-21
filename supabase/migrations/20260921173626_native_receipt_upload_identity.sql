-- GATED: immutable native upload identity only; no Storage bytes are written by SQL.
create table private.nest_receipt_upload_intents (
  household_id uuid not null references public.households(id),
  upload_id uuid not null,
  uploaded_by uuid not null references auth.users(id),
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 12 and 4194304),
  content_type text not null check (content_type in ('image/jpeg','application/pdf')),
  created_at timestamptz not null default now(),
  primary key (household_id,upload_id)
);
alter table private.nest_receipt_upload_intents enable row level security;
revoke all on private.nest_receipt_upload_intents from public,anon,authenticated;

create function private.nest_receipt_upload_input(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>1024
    or not (p_input ?& array['uploadId','sha256','bytes','contentType'])
    or (p_input-array['uploadId','sha256','bytes','contentType'])<>'{}'::jsonb then
    raise exception 'Invalid upload identity' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'uploadId') is distinct from 'string'
    or (p_input->>'uploadId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'sha256') is distinct from 'string'
    or (p_input->>'sha256') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid upload identity' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'bytes') is distinct from 'number'
    or (p_input->>'bytes') !~ '^[1-9][0-9]{1,6}$'
    or jsonb_typeof(p_input->'contentType') is distinct from 'string'
    or (p_input->>'contentType') not in ('image/jpeg','application/pdf') then
    raise exception 'Invalid upload identity' using errcode='22023'; end if;
  if (p_input->>'bytes')::integer not between 12 and 4194304 then
    raise exception 'Invalid upload identity' using errcode='22023'; end if;
  return jsonb_set(p_input,'{uploadId}',to_jsonb((p_input->>'uploadId')::uuid));
end;
$$;
revoke all on function private.nest_receipt_upload_input(jsonb) from public,anon,authenticated;

create function private.nest_reserve_receipt_upload(p_household uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_path text; v_created integer; v_stored boolean;
  v_intent private.nest_receipt_upload_intents; v_upload public.household_attachment_uploads;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  v_input:=private.nest_receipt_upload_input(p_input);
  v_path:=p_household::text||'/receipts/'||(v_input->>'uploadId')||
    case when v_input->>'contentType'='image/jpeg' then '.jpg' else '.pdf' end;
  insert into private.nest_receipt_upload_intents(household_id,upload_id,uploaded_by,path,sha256,bytes,content_type)
    values(p_household,(v_input->>'uploadId')::uuid,auth.uid(),v_path,v_input->>'sha256',
      (v_input->>'bytes')::integer,v_input->>'contentType') on conflict do nothing;
  get diagnostics v_created=row_count;
  select * into v_intent from private.nest_receipt_upload_intents
    where household_id=p_household and upload_id=(v_input->>'uploadId')::uuid for update;
  if not found or v_intent.uploaded_by<>auth.uid() then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if v_intent.path<>v_path or v_intent.sha256<>v_input->>'sha256'
    or v_intent.bytes<>(v_input->>'bytes')::integer or v_intent.content_type<>v_input->>'contentType' then
    raise exception 'Upload identity changed' using errcode='40001'; end if;
  insert into public.household_attachment_uploads(path,household_id,uploaded_by,content_type)
    values(v_path,p_household,auth.uid(),v_intent.content_type) on conflict do nothing;
  select * into v_upload from public.household_attachment_uploads where path=v_path for update;
  if v_upload.uploaded_by<>auth.uid() or v_upload.household_id<>p_household
    or v_upload.content_type<>v_intent.content_type or v_upload.state not in ('pending','claimed') then
    raise exception 'Upload unavailable' using errcode='P0002'; end if;
  select exists(select 1 from storage.objects where bucket_id='household-files' and name=v_path) into v_stored;
  if v_created=1 and v_stored then raise exception 'Existing upload has no content identity' using errcode='40001'; end if;
  if v_upload.state='claimed' and not v_stored then raise exception 'Upload unavailable' using errcode='P0002'; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'uploaderId',auth.uid(),
    'uploadId',v_intent.upload_id,'path',v_path,'sha256',v_intent.sha256,
    'bytes',v_intent.bytes,'contentType',v_intent.content_type,'stored',v_stored);
end;
$$;
revoke all on function private.nest_reserve_receipt_upload(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.nest_reserve_receipt_upload(uuid,jsonb) to authenticated;
create function public.nest_reserve_receipt_upload(p_household uuid,p_input jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_reserve_receipt_upload($1,$2);
$$;
revoke all on function public.nest_reserve_receipt_upload(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nest_reserve_receipt_upload(uuid,jsonb) to authenticated;
