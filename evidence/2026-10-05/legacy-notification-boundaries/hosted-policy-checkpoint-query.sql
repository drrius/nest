select jsonb_build_object(
'rows',count(*),
'rowSha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(p) order by household_id,member_id),'[]')::text,'UTF8')),'hex'),
'policies',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'qual',qual,'check',with_check) order by policyname)
  from pg_policies where schemaname='public' and tablename='notification_digest_preferences')
) as checkpoint from public.notification_digest_preferences p;
