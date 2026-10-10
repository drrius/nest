import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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

test("managed tables permit scoped definer reads but deny runtime ownership and client access", () => {
  const bootstrap = startFixturePostgres();
  try {
    const db = createFixtureMigrationOwner(bootstrap);
    db.sql(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      insert into auth.users values('00000000-0000-0000-0000-000000000001');
      insert into auth.sessions values('00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001');
      create function public.managed_session_count() returns integer language plpgsql security definer
      set search_path='' as $$begin
        if auth.uid() is null then raise exception 'unauthorized'; end if;
        return (select count(*)::integer from auth.sessions where user_id=auth.uid());
      end$$;
      revoke all on function public.managed_session_count() from public,anon;
      grant execute on function public.managed_session_count() to authenticated;`);
    db.file(fileURLToPath(new URL("./receipt-storage-fixture.sql", import.meta.url)));
    const profile = configureFixtureRuntimeOwner(db);
    assert.equal(profile.managedOwnership.matchesObservedOwnershipCapabilities, true);
    assert.equal(profile.managedOwnership.interfacesRemainSimulated, true);
    assert.equal(profile.hostedPermissionParityVerified, false);
    assert.equal(db.sql("select count(*) from auth.sessions"), "1");
    db.sql("insert into storage.buckets(id,name) values('fixture','fixture')");
    db.sql("insert into storage.objects(bucket_id,name) values('fixture','preserved')");
    assert.equal(db.sql("set role authenticated; select count(*) from storage.objects"), "0");
    assert.throws(() => db.sql("set role authenticated; select * from auth.sessions"));
    assert.equal(
      db.sql(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
        select public.managed_session_count()`),
      "1",
    );
    assert.equal(
      db.sql(`set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
        select public.managed_session_count()`),
      "0",
    );
    assert.throws(() => db.sql("set role anon; select public.managed_session_count()"));
    assert.throws(() => db.sql("alter table auth.users add column unexpected integer"));
    assert.throws(() => db.sql("create table storage.unexpected(id integer)"));
    assert.throws(() => db.sql("set role supabase_auth_admin"));
    assert.equal(db.sql("select name from storage.objects"), "preserved");
  } finally {
    bootstrap.stop();
  }
});

test("a partial managed interface refuses ownership configuration", () => {
  const bootstrap = startFixturePostgres();
  try {
    const db = createFixtureMigrationOwner(bootstrap);
    db.sql(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls; create schema auth;
      create table auth.users(id uuid primary key);`);
    assert.throws(() => configureFixtureRuntimeOwner(db), /requires all four/u);
    assert.equal(db.sql("select rolsuper from pg_roles where rolname=current_user"), "t");
  } finally {
    bootstrap.stop();
  }
});
