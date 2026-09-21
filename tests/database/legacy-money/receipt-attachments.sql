-- Private, immutable attachments. Pending uploads and parent claims share a row
-- lock, so cleanup can never delete a file while a parent starts using it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-files', 'household-files', false, 4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.household_attachment_uploads (
  path text primary key,
  household_id uuid not null references public.households(id),
  uploaded_by uuid not null references auth.users(id),
  content_type text not null,
  state text not null default 'pending' check (state in ('pending', 'claimed', 'deleting', 'deleted')),
  created_at timestamptz not null default now()
);
create index household_attachment_cleanup_idx
  on public.household_attachment_uploads (household_id, state, created_at);
alter table public.household_attachment_uploads enable row level security;
revoke all on public.household_attachment_uploads from anon, authenticated;
grant select on public.household_attachment_uploads to authenticated;
create policy attachment_uploads_read on public.household_attachment_uploads
  for select to authenticated using (exists (
    select 1 from public.household_members m
    where m.household_id = household_attachment_uploads.household_id and m.user_id = (select auth.uid())
  ));

create function public.reserve_household_attachment(p_path text, p_content_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_household uuid; v_upload public.household_attachment_uploads;
begin
  select m.household_id into v_household from public.household_members m where m.user_id = auth.uid();
  if v_household is null or p_path is null or p_content_type is null
    or lower(split_part(p_path, '/', 1)) <> v_household::text
    or p_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(receipts|completions|documents)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
    or p_content_type <> (case lower(split_part(p_path, '.', 2))
      when 'jpg' then 'image/jpeg' when 'png' then 'image/png'
      when 'webp' then 'image/webp' when 'pdf' then 'application/pdf' else '' end)
    or (lower(split_part(p_path, '/', 2)) = 'completions' and p_content_type = 'application/pdf')
  then raise exception 'Invalid attachment' using errcode = '22023'; end if;
  insert into public.household_attachment_uploads(path, household_id, uploaded_by, content_type)
    values(p_path, v_household, auth.uid(), p_content_type) on conflict do nothing;
  select * into v_upload from public.household_attachment_uploads where path = p_path for update;
  if v_upload.uploaded_by <> auth.uid() or v_upload.content_type <> p_content_type or v_upload.state <> 'pending'
  then raise exception 'Attachment is no longer pending' using errcode = '22023'; end if;
  return exists (select 1 from storage.objects where bucket_id = 'household-files' and name = p_path);
end $$;

-- The Edge writer is privileged, so this trigger (not an RLS-only check) must
-- lock the same pending row as cleanup before any household object is inserted.
create function private.guard_household_attachment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_upload public.household_attachment_uploads;
begin
  if new.bucket_id <> 'household-files' then return new; end if;
  select * into v_upload from public.household_attachment_uploads where path = new.name for update;
  if not found or v_upload.state <> 'pending'
    or v_upload.content_type is distinct from new.metadata->>'mimetype'
  then raise exception 'Attachment is no longer pending' using errcode = '22023'; end if;
  return new;
end $$;
create trigger guard_household_attachment_insert before insert on storage.objects
  for each row execute function private.guard_household_attachment_insert();

-- Called only by parent-table triggers, including household_documents when added.
-- A claimed row stays claimed even after a receipt is reversed or replaced.
create function private.claim_household_attachment(p_path text, p_household_id uuid)
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
  update public.household_attachment_uploads set state = 'claimed' where path = p_path;
end $$;

create function private.claim_parent_household_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  v_path := to_jsonb(new)->>tg_argv[0];
  if tg_op = 'INSERT' or v_path is distinct from (to_jsonb(old)->>tg_argv[0]) then
    if tg_argv[0] = 'photo_path' and v_path is not null
      and v_path !~* '/completions/[0-9a-f-]+\.(jpg|png|webp)$'
    then raise exception 'Choose a completion photo' using errcode = '22023'; end if;
    if tg_argv[0] = 'receipt_path' and v_path is not null
      and v_path !~* '/receipts/[0-9a-f-]+\.(jpg|png|webp|pdf)$'
    then raise exception 'Choose a receipt attachment' using errcode = '22023'; end if;
    perform private.claim_household_attachment(v_path, new.household_id);
  end if;
  return new;
end $$;
create trigger claim_financial_receipt before insert or update of receipt_path on public.financial_events
  for each row execute function private.claim_parent_household_attachment('receipt_path');
-- Explicit removal only affects the uploader's pending files. Any member can
-- reclaim abandoned uploads after 24 hours. Interrupted deletions are retried.
create function public.begin_household_attachment_cleanup(p_path text default null)
returns table(path text) language plpgsql security definer set search_path = '' as $$
declare v_household uuid;
begin
  select m.household_id into v_household from public.household_members m where m.user_id = auth.uid();
  if v_household is null then raise exception 'Not a household member' using errcode = '42501'; end if;
  return query with candidates as (
    select u.path from public.household_attachment_uploads u
    where u.household_id = v_household and u.state in ('pending', 'deleting')
      and ((p_path is not null and u.path = p_path and u.uploaded_by = auth.uid())
        or (p_path is null and (u.state = 'deleting' or u.created_at < now() - interval '24 hours')))
    order by u.created_at, u.path limit 20 for update skip locked
  ) update public.household_attachment_uploads u set state = 'deleting'
    from candidates c where u.path = c.path returning u.path;
end $$;

create function public.finish_household_attachment_cleanup(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.household_attachment_uploads u set state = 'deleted'
  where u.path = p_path and u.state = 'deleting'
    and exists(select 1 from public.household_members m where m.household_id = u.household_id and m.user_id = auth.uid())
    and not exists(select 1 from storage.objects o where o.bucket_id = 'household-files' and o.name = p_path);
end $$;

revoke all on function public.reserve_household_attachment(text,text), public.begin_household_attachment_cleanup(text), public.finish_household_attachment_cleanup(text) from public, anon;
grant execute on function public.reserve_household_attachment(text,text), public.begin_household_attachment_cleanup(text), public.finish_household_attachment_cleanup(text) to authenticated;
revoke all on function private.claim_household_attachment(text,uuid), private.claim_parent_household_attachment(), private.guard_household_attachment_insert() from public, anon, authenticated;


create policy household_files_read on storage.objects for select to authenticated
using (bucket_id = 'household-files' and exists (
  select 1 from public.household_members m where m.user_id = (select auth.uid())
    and m.household_id::text = split_part(name, '/', 1)
));
-- No authenticated INSERT policy: only the byte-inspecting Edge Function writes.
-- Bucket MIME metadata alone cannot distinguish a PDF disguised as an image.
create policy household_files_cleanup on storage.objects for delete to authenticated
using (bucket_id = 'household-files' and exists (
  select 1 from public.household_attachment_uploads u where u.path = name and u.state = 'deleting'
));
