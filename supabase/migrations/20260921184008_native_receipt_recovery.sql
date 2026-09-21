-- GATED: read-only native upload recovery; no automatic cleanup or financial writes.
create index nest_receipt_upload_owner_idx on private.nest_receipt_upload_intents(household_id,uploaded_by,upload_id);
create function private.nest_read_receipt_uploads(p_household uuid,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_more boolean;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  with candidates as (
    select i.*,u.state,
      exists(select 1 from storage.objects o where o.bucket_id='household-files' and o.name=i.path) as stored
    from private.nest_receipt_upload_intents i
    join public.household_attachment_uploads u on u.path=i.path
    where i.household_id=p_household and i.uploaded_by=auth.uid()
      and u.household_id=p_household and u.uploaded_by=auth.uid() and u.content_type=i.content_type
      and u.state in ('pending','deleting') and (p_after is null or i.upload_id>p_after)
    order by i.upload_id limit 51
  ), numbered as (select *,row_number() over(order by upload_id) as n from candidates)
  select coalesce(jsonb_agg(jsonb_build_object('uploadId',upload_id,'sha256',sha256,'bytes',bytes,
    'contentType',content_type,'path',path,'status',state,'stored',stored,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    order by upload_id) filter(where n<=50),'[]'::jsonb),count(*)>50
    into v_rows,v_more from numbered;
  return jsonb_build_object('version',1,'householdId',p_household,'uploaderId',auth.uid(),
    'after',p_after,'uploads',v_rows,'next',case when v_more then v_rows->49->>'uploadId' else null end);
end;
$$;
revoke all on function private.nest_read_receipt_uploads(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_receipt_uploads(uuid,uuid) to authenticated;
create function public.nest_read_receipt_uploads(p_household uuid,p_after uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_read_receipt_uploads($1,$2);
$$;
revoke all on function public.nest_read_receipt_uploads(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_receipt_uploads(uuid,uuid) to authenticated;
