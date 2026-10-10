import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixturePostgres } from "../../tests/database/fixture-postgres.mjs";
import { createFixtureMigrationOwner } from "./fixture-runtime-owner.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fields = [
  "schema",
  "definitionSha256",
  "securityDefiner",
  "anonymousExecute",
  "authenticatedExecute",
  "serviceRoleExecute",
];

function indexFunctions(functions) {
  if (!Array.isArray(functions)) throw new Error("Catalog functions must be an array");
  const result = new Map();
  for (const row of functions) {
    if (!row || typeof row.signature !== "string" || typeof row.owner !== "string")
      throw new Error("Catalog function identity or owner is missing");
    if (
      !["public", "private"].includes(row.schema) ||
      !/^[a-f0-9]{64}$/u.test(row.definitionSha256)
    )
      throw new Error(`Invalid catalog definition: ${row.signature}`);
    if (fields.slice(2).some((field) => typeof row[field] !== "boolean"))
      throw new Error(`Invalid catalog execution flags: ${row.signature}`);
    if (result.has(row.signature)) throw new Error(`Duplicate catalog signature: ${row.signature}`);
    result.set(row.signature, row);
  }
  return result;
}

export function compareLegacyCatalog(observed, fixture) {
  const expected = indexFunctions(observed),
    actual = indexFunctions(fixture);
  const missing = [],
    extra = [],
    mismatches = [],
    ownerDifferences = [];
  for (const [signature, row] of expected) {
    const candidate = actual.get(signature);
    if (!candidate) {
      missing.push(signature);
      continue;
    }
    const changed = fields.filter((field) => row[field] !== candidate[field]);
    if (changed.length)
      mismatches.push({ signature, fields: changed, observed: row, fixture: candidate });
    if (row.owner !== candidate.owner)
      ownerDifferences.push({ signature, observed: row.owner, fixture: candidate.owner });
  }
  for (const signature of actual.keys()) if (!expected.has(signature)) extra.push(signature);
  return {
    exactFunctionCatalogMatch: missing.length + extra.length + mismatches.length === 0,
    observedCount: expected.size,
    fixtureCount: actual.size,
    missing: missing.sort((left, right) => left.localeCompare(right)),
    extra: extra.sort((left, right) => left.localeCompare(right)),
    mismatches,
    ownerDifferences,
    ownerCapabilityParityVerified: false,
    runtimeSemanticParityVerified: false,
  };
}

function applyLegacy(db, directory, report) {
  for (const name of readdirSync(directory)
    .filter((entry) => entry.endsWith(".sql"))
    .sort()) {
    const path = resolve(directory, name),
      text = readFileSync(path, "utf8");
    const entry = { name, sha256: createHash("sha256").update(text).digest("hex") };
    if (name === "20260814153314_enable_pg_net.sql") {
      if (text.trim() !== "create extension if not exists pg_net with schema extensions;")
        throw new Error("The explicitly excluded pg_net declaration has changed");
      report.skipped.push(entry);
      continue;
    }
    try {
      db.file(path);
    } catch (error) {
      report.failed = entry;
      throw new Error(`${name}: ${error.stderr?.toString() ?? error.message}`);
    }
    report.applied.push(entry);
  }
}

function bootstrapManagedInterfaces(db) {
  db.sql(`create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create publication supabase_realtime;`);
  db.file(resolve(root, "tests/database/receipt-storage-fixture.sql"));
}

function captureCatalog(db) {
  return JSON.parse(
    db.sql(`begin isolation level repeatable read read only;
    set local search_path=pg_catalog;
    select jsonb_build_object('serverVersion',current_setting('server_version'),
      'role',current_user,'readOnly',current_setting('transaction_read_only')='on',
      'functions',(select coalesce(jsonb_agg(jsonb_build_object(
        'signature',p.oid::regprocedure::text,'schema',n.nspname,
        'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
        'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
        'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
        'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
        'serviceRoleExecute',has_function_privilege('service_role',p.oid,'EXECUTE')
      ) order by n.nspname,p.oid::regprocedure::text),'[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind in ('f','p')));
    rollback;`),
  );
}

function run(directory, observationPath, outputPath) {
  const observationBytes = readFileSync(observationPath);
  const observed = JSON.parse(observationBytes);
  if (observed.readOnly !== true) throw new Error("Expected a read-only catalog observation");
  indexFunctions(observed.functions);
  const report = {
    kind: "legacy-function-catalog-fixture-comparison",
    complete: false,
    observationSha256: createHash("sha256").update(observationBytes).digest("hex"),
    observedServerVersion: observed.serverVersion,
    applied: [],
    skipped: [],
    simulated: ["Auth/Storage metadata interfaces", "fixture migration-owner capabilities"],
    ownerCapabilityParityVerified: false,
    runtimeSemanticParityVerified: false,
  };
  let bootstrap;
  try {
    bootstrap = startFixturePostgres();
    const db = createFixtureMigrationOwner(bootstrap);
    bootstrapManagedInterfaces(db);
    applyLegacy(db, resolve(directory), report);
    report.fixture = captureCatalog(db);
    report.comparison = compareLegacyCatalog(observed.functions, report.fixture.functions);
    report.complete = true;
    if (!report.comparison.exactFunctionCatalogMatch) process.exitCode = 1;
  } catch (error) {
    report.error = error.message;
    process.exitCode = 1;
  } finally {
    try {
      bootstrap?.stop();
    } catch (error) {
      report.cleanupError = error.message;
      process.exitCode = 1;
    }
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  const comparison = report.comparison
    ? { ...report.comparison, ownerDifferences: report.comparison.ownerDifferences.length }
    : undefined;
  process.stdout.write(
    `${JSON.stringify({ complete: report.complete, comparison, error: report.error, outputPath })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, observationPath, outputPath, extra] = process.argv.slice(2);
  if (!directory || !observationPath || !outputPath || extra)
    throw new Error(
      "Usage: compare-legacy-catalog.mjs LEGACY_MIGRATIONS OBSERVATION_JSON OUTPUT_JSON",
    );
  run(directory, observationPath, outputPath);
}
