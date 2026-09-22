import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json, as } from "./renewal-fixture.mjs";

function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  f.db.file("supabase/migrations/20260922230403_native_push_logout.sql");
  const request = (sql, actor = 1, session = 1100) =>
    as(actor, `set request.jwt.claims='${JSON.stringify({ session_id: id(session) })}'; ${sql}`);
  const execute = (sql, actor = 1, session = 1100) =>
    JSON.parse(f.db.sql(request(sql, actor, session)));
  const command = (op, revision = null) => ({
    operationId: id(op),
    installationId: id(1101),
    expectedRevision: revision,
    action: "register",
    token: "ExponentPushToken[LogoutFixture]",
  });
  const save = (value) => `select public.nest_save_push_device('${id(10)}',${json(value)})`;
  const revoke = "select public.nest_revoke_push_session()";
  return { ...f, request, execute, command, save, revoke };
}

test("logout fences late enrollment and cannot disable a fresh session or another actor", (t) => {
  const f = setup(t);
  const initial = f.execute(f.save(f.command(1110)));
  const revoked = f.execute(f.revoke);
  assert.deepEqual(revoked, { version: 1, actorId: id(1), sessionId: id(1100), revoked: true });
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.throws(() => f.execute(f.save(f.command(1111, initial.revision))), /session revoked/);
  assert.throws(() => f.execute(f.save(f.command(1110))), /session revoked/);
  const partner = f.execute(f.save(f.command(1112)), 2, 1200);
  assert.deepEqual(f.execute(f.revoke), revoked);
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), partner.revision);
  f.execute(f.revoke, 2, 1200);
  assert.throws(() => f.execute(f.save(f.command(1113))), /session revoked/);
  const fresh = f.execute(f.save(f.command(1114)), 1, 1300);
  f.execute(f.revoke);
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), fresh.revision);
  assert.equal(f.db.sql("select token from private.nest_push_devices"), f.command(0).token);
});

test("logout before any enrollment fences all installations and works after membership removal", (t) => {
  const f = setup(t);
  f.execute(f.revoke);
  for (const installation of [1101, 1102])
    assert.throws(
      () => f.execute(f.save({ ...f.command(1120), installationId: id(installation) })),
      /session revoked/,
    );
  f.execute(f.save(f.command(1121)), 1, 1300);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  f.execute(f.revoke, 1, 1300);
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.throws(() => f.db.sql(as(1, f.revoke)), /Authenticated session required/);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_push_revoked_sessions`),
      /permission denied/,
    );
  assert.throws(
    () =>
      f.db.sql(as(1, `select private.nest_save_push_device('${id(10)}',${json(f.command(1122))})`)),
    /permission denied/,
  );
});

test("concurrent logout and registration always finish disabled with no future stale enrollment", async (t) => {
  const f = setup(t);
  const results = await Promise.allSettled([
    f.db.concurrent(f.request(f.save(f.command(1130)))),
    f.db.concurrent(f.request(f.revoke)),
  ]);
  assert.equal(results[1].status, "fulfilled");
  if (results[0].status === "rejected") assert.match(String(results[0].reason), /session revoked/);
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_devices where token is not null"),
    "0",
  );
  assert.throws(() => f.execute(f.save(f.command(1131))), /session revoked/);
});

test("revocation is atomic and historical replay cannot transfer session ownership", (t) => {
  const f = setup(t);
  const initial = f.execute(f.save(f.command(1140)));
  assert.deepEqual(f.execute(f.save(f.command(1140)), 1, 1300), initial);
  assert.equal(f.db.sql("select session_id from private.nest_push_devices"), id(1100));
  f.execute(f.revoke, 1, 1300);
  assert.equal(f.db.sql("select token is not null from private.nest_push_devices"), "t");
  f.db.sql(
    "alter table private.nest_push_devices add constraint fixture_require_token check(token is not null)",
  );
  assert.throws(() => f.execute(f.revoke), /fixture_require_token/);
  assert.equal(
    f.db.sql(
      `select count(*) from private.nest_push_revoked_sessions where session_id='${id(1100)}'`,
    ),
    "0",
  );
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), initial.revision);
  f.db.sql("alter table private.nest_push_devices drop constraint fixture_require_token");
  f.execute(f.revoke);
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
});
