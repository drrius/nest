import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  createFixtureMigrationOwner,
  configureFixtureRuntimeOwner,
} from "../../tools/migration/fixture-runtime-owner.mjs";

test("runtime owner is non-superuser while authorized definer calls retain RLS bypass", () => {
  const bootstrap = startFixturePostgres();
  try {
    const db = createFixtureMigrationOwner(bootstrap);
    db.sql(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls;
      create table public.runtime_owner_probe(id integer primary key);
      insert into public.runtime_owner_probe values(1);
      alter table public.runtime_owner_probe enable row level security;
      alter table public.runtime_owner_probe force row level security;
      create policy denied on public.runtime_owner_probe to authenticated using(false);
      grant select on public.runtime_owner_probe to authenticated;
      create function public.runtime_owner_count() returns integer language plpgsql security definer
      set search_path=pg_catalog,public as $$begin
        if current_setting('is_superuser')='on' then raise exception 'superuser execution'; end if;
        return (select count(*)::integer from public.runtime_owner_probe);
      end$$;
      revoke all on function public.runtime_owner_count() from public,anon,authenticated;
      grant execute on function public.runtime_owner_count() to authenticated;`);
    const profile = configureFixtureRuntimeOwner(db);
    assert.equal(profile.before.superuser, true);
    assert.equal(profile.after.superuser, false);
    assert.equal(profile.after.bypassRLS, true);
    assert.equal(profile.hostedPermissionParityVerified, false);
    assert.equal(
      db.sql("set role authenticated; select count(*) from public.runtime_owner_probe"),
      "0",
    );
    assert.equal(db.sql("set role authenticated; select public.runtime_owner_count()"), "1");
    assert.throws(() => db.sql("set role anon; select public.runtime_owner_count()"));
    assert.throws(() => db.sql("create role forbidden_superuser superuser"));
  } finally {
    bootstrap.stop();
  }
});
