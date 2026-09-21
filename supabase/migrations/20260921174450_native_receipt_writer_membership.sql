-- GATED: a privileged native object insertion must still belong to a current member.
-- The existing guard first locks the pending registry row. Shared membership locks
-- are compatible with reservations; removal itself does not lock attachment rows.
create function private.nest_guard_receipt_writer()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_intent private.nest_receipt_upload_intents;
begin
  if new.bucket_id<>'household-files' then return new; end if;
  select * into v_intent from private.nest_receipt_upload_intents where path=new.name;
  if not found then return new; end if;
  perform 1 from public.household_members where household_id=v_intent.household_id
    and user_id=v_intent.uploaded_by for key share;
  if not found then raise exception 'Uploader is no longer authorized' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.nest_guard_receipt_writer() from public,anon,authenticated;
create trigger guard_native_receipt_writer before insert on storage.objects
  for each row execute function private.nest_guard_receipt_writer();
