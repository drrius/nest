select coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'kind',c.relkind,
      'rls',c.relrowsecurity,'forcedRls',c.relforcerowsecurity,
      'policies',(select count(*) from pg_policy p where p.polrelid=c.oid),
      'roles',(select jsonb_agg(jsonb_build_object(
        'role',r.rolname,'schemaUsage',has_schema_privilege(r.oid,n.oid,'USAGE'),
        'select',has_any_column_privilege(r.oid,c.oid,'SELECT'),
        'insert',has_any_column_privilege(r.oid,c.oid,'INSERT'),
        'update',has_any_column_privilege(r.oid,c.oid,'UPDATE'),
        'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
        'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE')) order by r.rolname)
        from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
      ) order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private','storage') and c.relkind in ('r','p','v','m');
