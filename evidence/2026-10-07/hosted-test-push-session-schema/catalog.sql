begin isolation level repeatable read read only;
set local search_path=pg_catalog;
select jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'role',current_user,
 'relation',c.oid::regclass::text,
 'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object(
  'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
  'notNull',a.attnotnull,'roleCanSelect',has_column_privilege(current_user,c.oid,a.attname,'SELECT')
 ) order by a.attname) from pg_attribute a
 where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 and a.attname in ('id','user_id','not_after'))
) as observation
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='auth' and c.relname='sessions';
rollback;
