// Read-only catalog evidence. Executability is not proof that a function is a writer.
export function captureLegacyWriterInventory(db) {
  return JSON.parse(
    db.sql(`select jsonb_build_object(
    'legacyCallableFunctions',(select coalesce(jsonb_agg(jsonb_build_object(
      'signature',p.oid::regprocedure::text,'securityDefiner',p.prosecdef,
      'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'serviceRole',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text),'[]')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname not like 'nest\\_%' escape '\\'
        and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))),
    'legacyWritableTables',(select coalesce(jsonb_agg(jsonb_build_object(
      'table',c.relname,'rls',c.relrowsecurity,
      'authenticated',has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'),
      'serviceRole',has_any_column_privilege('service_role',c.oid,'INSERT,UPDATE') or has_table_privilege('service_role',c.oid,'DELETE')) order by c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname not like 'nest\\_%' escape '\\'
        and (has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE')
          or has_any_column_privilege('service_role',c.oid,'INSERT,UPDATE') or has_table_privilege('service_role',c.oid,'DELETE'))),
    'cutoverVerified',false)`),
  );
}
