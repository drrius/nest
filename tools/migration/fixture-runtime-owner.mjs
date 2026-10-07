import {
  prepareManagedFixtureOwnership,
  verifyManagedFixtureOwnership,
} from "./fixture-managed-ownership.mjs";

export function captureFixtureOwner(db) {
  return JSON.parse(
    db.sql(`select jsonb_build_object(
      'name',rolname,'superuser',rolsuper,'bypassRLS',rolbypassrls,
      'inherit',rolinherit,'createRole',rolcreaterole,'createDatabase',rolcreatedb,
      'replication',rolreplication
    ) from pg_roles where rolname=current_user`),
  );
}

export function configureFixtureRuntimeOwner(db) {
  const before = captureFixtureOwner(db);
  if (!before.superuser || !before.bypassRLS)
    throw new Error("Disposable bootstrap must have its expected administrative role");
  const managedTables = prepareManagedFixtureOwnership(db, before.name);
  const identifier = `"${before.name.replaceAll('"', '""')}"`;
  db.sql(
    `grant usage,create on schema public to ${identifier};
     grant anon,authenticated,service_role to ${identifier}; alter role ${identifier} nosuperuser;`,
  );
  const after = captureFixtureOwner(db);
  if (
    after.superuser ||
    !after.bypassRLS ||
    !after.inherit ||
    !after.createRole ||
    !after.createDatabase ||
    !after.replication
  )
    throw new Error("Disposable runtime owner differs from the measured hosted role flags");
  return {
    before,
    after,
    roleFlagsMatchHostedObservation: true,
    hostedPermissionParityVerified: false,
    managedOwnership: managedTables ? verifyManagedFixtureOwnership(db) : null,
    simulated: [
      "Auth/Storage shapes, interfaces and remaining grants",
      "API-role membership for fixture actors",
    ],
  };
}
export function createFixtureMigrationOwner(bootstrap) {
  const role = "nest_fixture_owner";
  bootstrap.sql(
    `create role ${role} login superuser bypassrls inherit createrole createdb replication;`,
  );
  return {
    sql: (sql) => bootstrap.sql(sql, role),
    file: (file) => bootstrap.file(file, role),
    concurrent: (sql) => bootstrap.concurrent(sql, role),
    stop: bootstrap.stop,
  };
}
