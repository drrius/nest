select jsonb_build_object(
  'runtimeRole', current_user,
  'schemas', (
    select jsonb_agg(jsonb_build_object(
      'schema', nspname, 'owner', pg_get_userbyid(nspowner),
      'usage', has_schema_privilege(current_user, oid, 'USAGE'),
      'create', has_schema_privilege(current_user, oid, 'CREATE'),
      'runtimeInheritsOwner', pg_has_role(current_user, nspowner, 'USAGE'),
      'runtimeCanSetOwner', pg_has_role(current_user, nspowner, 'SET')
    ) order by nspname)
    from pg_namespace where nspname in ('auth', 'storage')
  )
) observation;

select jsonb_build_object(
  'runtimeRole', current_user,
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname, 'owner', pg_get_userbyid(c.relowner),
      'rls', c.relrowsecurity, 'forceRLS', c.relforcerowsecurity,
      'runtimeInheritsOwner', pg_has_role(current_user, c.relowner, 'USAGE'),
      'runtimeCanSetOwner', pg_has_role(current_user, c.relowner, 'SET'),
      'privileges', (
        select jsonb_object_agg(p, has_table_privilege(current_user, c.oid, p))
        from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      )
    ) order by n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname,c.relname) in
      (('auth','users'),('auth','sessions'),('storage','buckets'),('storage','objects'))
  )
) observation;
