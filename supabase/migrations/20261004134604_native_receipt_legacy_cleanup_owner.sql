-- Legacy household sweeps must not invalidate a native uploader's private,
-- durable receipt intent. Preserve legacy abandoned-file cleanup and row locks.
create or replace function public.begin_household_attachment_cleanup(p_path text default null)
returns table(path text) language plpgsql security definer set search_path = '' as $$
declare v_household uuid; v_path text;
begin
  select m.household_id into v_household from public.household_members m where m.user_id = auth.uid();
  if v_household is null then raise exception 'Not a household member' using errcode = '42501'; end if;
  for v_path in
    select u.path from public.household_attachment_uploads u
    where u.household_id = v_household and u.state in ('pending', 'deleting')
      and not exists (
        select 1 from private.nest_receipt_upload_intents i
        where i.path = u.path and i.uploaded_by is distinct from auth.uid()
      )
      and ((p_path is not null and u.path = p_path and u.uploaded_by = auth.uid())
        or (p_path is null and (u.state = 'deleting' or u.created_at < now() - interval '24 hours')))
    order by u.created_at, u.path limit 20 for update skip locked
  loop
    -- Recheck after acquiring the upload row lock with a fresh statement snapshot.
    -- A native reservation may have committed after candidate selection began.
    if not exists (
      select 1 from private.nest_receipt_upload_intents i
      where i.path = v_path and i.uploaded_by is distinct from auth.uid()
    ) then
      return query update public.household_attachment_uploads u set state = 'deleting'
        where u.path = v_path returning u.path;
    end if;
  end loop;
end $$;

create or replace function public.finish_household_attachment_cleanup(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.household_attachment_uploads u set state = 'deleted'
  where u.path = p_path and u.state = 'deleting'
    and exists(select 1 from public.household_members m where m.household_id = u.household_id and m.user_id = auth.uid())
    and not exists (
      select 1 from private.nest_receipt_upload_intents i
      where i.path = u.path and i.uploaded_by is distinct from auth.uid()
    )
    and not exists(select 1 from storage.objects o where o.bucket_id = 'household-files' and o.name = p_path);
end $$;

revoke all on function public.begin_household_attachment_cleanup(text),
  public.finish_household_attachment_cleanup(text) from public, anon;
grant execute on function public.begin_household_attachment_cleanup(text),
  public.finish_household_attachment_cleanup(text) to authenticated;
