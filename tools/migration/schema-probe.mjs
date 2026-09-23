import {
  seedFinancialRehearsal,
  captureRehearsal,
  compareRehearsal,
} from "./financial-rehearsal.mjs";
// Disposable schema diagnostic. Never accepts an existing database URL.
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixturePostgres } from "../../tests/database/fixture-postgres.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const [legacy, mode] = process.argv.slice(2);
if (!legacy || (mode && mode !== "--without-pg-net"))
  throw new Error("Usage: schema-probe.mjs LEGACY_MIGRATION_DIRECTORY [--without-pg-net]");
const report = {
  kind: "schema-and-financial-fixture-diagnostic",
  applied: [],
  skipped: [],
  complete: false,
};
const db = startFixturePostgres();
function apply(directory, source) {
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const path = resolve(directory, name),
      text = readFileSync(path, "utf8");
    const entry = { source, name, sha256: createHash("sha256").update(text).digest("hex") };
    if (source === "legacy" && name === "20260814153314_enable_pg_net.sql" && mode) {
      if (text.trim() !== "create extension if not exists pg_net with schema extensions;")
        throw new Error("The explicitly excluded pg_net declaration has changed");
      report.skipped.push(entry);
      continue;
    }
    try {
      db.file(path);
    } catch (error) {
      throw new Error(`${source}/${name}: ${error.stderr?.toString() ?? error.message}`);
    }
    report.applied.push(entry);
  }
}
try {
  db.sql(`create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create publication supabase_realtime;`);
  db.file(resolve(root, "tests/database/receipt-storage-fixture.sql"));
  apply(resolve(legacy), "legacy");
  seedFinancialRehearsal(db);
  const before = captureRehearsal(db);
  apply(resolve(root, "supabase/migrations"), "native");
  report.reconciliation = compareRehearsal(before, captureRehearsal(db));
  if (!report.reconciliation.passed) throw new Error("Financial fixture reconciliation failed");
  report.infrastructure = {
    simulated: ["auth.users", "auth.sessions", "auth.uid", "storage.buckets", "storage.objects"],
    installedExtensions: JSON.parse(
      db.sql("select coalesce(json_agg(extname order by extname),'[]') from pg_extension"),
    ),
    schedulingVerified: false,
    storageBytesVerified: false,
  };
  report.complete = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  db.stop();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
