-- Keep legacy attachment access unchanged. Native unposted receipt bytes belong
-- to the uploader; shared financial history authorizes both household members.
create function private.nest_can_read_receipt_object(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.nest_receipt_upload_intents where path=p_path)
    or exists(
      select 1 from private.nest_receipt_upload_intents i
      join public.household_attachment_uploads u on u.path=i.path and u.household_id=i.household_id
      where i.path=p_path and private.is_household_member(i.household_id)
        and u.state in ('pending','claimed','deleting')
        and (i.uploaded_by=auth.uid() or (u.state in ('pending','claimed') and exists(
          select 1 from public.financial_events e where e.household_id=i.household_id and e.receipt_path=i.path)))
    );
$$;
revoke all on function private.nest_can_read_receipt_object(text) from public,anon,authenticated,service_role;
grant execute on function private.nest_can_read_receipt_object(text) to authenticated;

-- Restrictive AND prevents the legacy permissive household policy from granting
-- access on its own. Owner reads during deleting also permit Storage cleanup.
create policy native_receipt_object_privacy on storage.objects as restrictive
  for select to authenticated
  using (bucket_id<>'household-files' or private.nest_can_read_receipt_object(name));
