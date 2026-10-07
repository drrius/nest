const tables = [
  ["auth", "sessions", "supabase_auth_admin"],
  ["auth", "users", "supabase_auth_admin"],
  ["storage", "buckets", "supabase_storage_admin"],
  ["storage", "objects", "supabase_storage_admin"],
];
const permissions = "select,insert,update,delete,truncate,references,trigger";

export function prepareManagedFixtureOwnership(db, runtimeRole) {
  const present = tables.filter(([schema, table]) =>
    db.sql(`select to_regclass('${schema}.${table}') is not null`).includes("t"),
  );
  if (!present.length) return false;
  if (present.length !== tables.length)
    throw new Error("Managed fixture ownership requires all four modeled tables");
  const runtime = `"${runtimeRole.replaceAll('"', '""')}"`;
  db.sql(`create role supabase_admin nologin nosuperuser nobypassrls;
    create role supabase_auth_admin nologin nosuperuser nobypassrls;
    create role supabase_storage_admin nologin nosuperuser nobypassrls;`);
  for (const [schema, table, owner] of tables)
    db.sql(`alter table ${schema}.${table} owner to ${owner};
      alter table ${schema}.${table} enable row level security;
      grant ${permissions} on ${schema}.${table} to ${runtime};`);
  for (const schema of ["auth", "storage"])
    db.sql(`alter schema ${schema} owner to supabase_admin;
      grant usage on schema ${schema} to ${runtime};
      grant usage on schema ${schema} to supabase_${schema}_admin;`);
  return true;
}

export function captureManagedFixtureOwnership(db) {
  return JSON.parse(
    db.sql(`select jsonb_build_object(
      'schemas',(select jsonb_agg(jsonb_build_object(
        'schema',nspname,'owner',pg_get_userbyid(nspowner),
        'usage',has_schema_privilege(current_user,oid,'USAGE'),
        'create',has_schema_privilege(current_user,oid,'CREATE'),
        'runtimeInheritsOwner',pg_has_role(current_user,nspowner,'USAGE'),
        'runtimeCanSetOwner',pg_has_role(current_user,nspowner,'SET')) order by nspname)
        from pg_namespace where nspname in ('auth','storage')),
      'tables',(select jsonb_agg(jsonb_build_object(
        'schema',n.nspname,'table',c.relname,'owner',pg_get_userbyid(c.relowner),
        'rls',c.relrowsecurity,'forceRLS',c.relforcerowsecurity,
        'runtimeInheritsOwner',pg_has_role(current_user,c.relowner,'USAGE'),
        'runtimeCanSetOwner',pg_has_role(current_user,c.relowner,'SET'),
        'privileges',(select jsonb_object_agg(p,has_table_privilege(current_user,c.oid,p))
          from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p))
        order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where (n.nspname,c.relname) in
          (('auth','users'),('auth','sessions'),('storage','buckets'),('storage','objects'))))`),
  );
}

export function verifyManagedFixtureOwnership(db) {
  const observed = captureManagedFixtureOwnership(db);
  const schemasMatch =
    observed.schemas.length === 2 &&
    observed.schemas.every(
      (schema) =>
        schema.owner === "supabase_admin" &&
        schema.usage &&
        !schema.create &&
        !schema.runtimeInheritsOwner &&
        !schema.runtimeCanSetOwner,
    );
  const tablesMatch =
    observed.tables.length === 4 &&
    observed.tables.every(
      (table, index) =>
        table.schema === tables[index][0] &&
        table.table === tables[index][1] &&
        table.owner === tables[index][2] &&
        table.rls &&
        !table.forceRLS &&
        !table.runtimeInheritsOwner &&
        !table.runtimeCanSetOwner &&
        Object.values(table.privileges).every(Boolean),
    );
  if (!schemasMatch || !tablesMatch)
    throw new Error("Managed runtime fixture differs from observed ownership capabilities");
  return { observed, matchesObservedOwnershipCapabilities: true, interfacesRemainSimulated: true };
}
