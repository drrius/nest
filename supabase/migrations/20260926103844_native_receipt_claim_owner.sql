-- Preserve the existing row lock and legacy attachment behavior.
create or replace function private.claim_household_attachment(p_path text, p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_upload public.household_attachment_uploads;
begin
  if p_path is null then return; end if;
  select * into v_upload from public.household_attachment_uploads where path = p_path for update;
  if not found or v_upload.household_id <> p_household_id
    or v_upload.state not in ('pending', 'claimed')
    or not exists(select 1 from public.household_members m where m.household_id = p_household_id and m.user_id = auth.uid())
    or not exists(select 1 from storage.objects where bucket_id = 'household-files' and name = p_path)
  then raise exception 'Attachment is unavailable. Upload it again.' using errcode = '22023'; end if;
  if v_upload.state = 'pending' and exists (
    select 1 from private.nest_receipt_upload_intents i
    where i.path = p_path and i.uploaded_by is distinct from auth.uid()
  ) then
    raise exception 'Only the uploader can attach a pending receipt.' using errcode = '42501';
  end if;
  update public.household_attachment_uploads set state = 'claimed' where path = p_path;
end $$;

