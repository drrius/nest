import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json, as } from "./renewal-fixture.mjs";

test("fresh authentication revokes only its own prior push session without membership", (t) => {
  const f = fixture(t);
  for (const file of [
    "20260922223732_native_push_registration.sql",
    "20260922230403_native_push_logout.sql",
    "20260922232801_native_push_reauthentication_logout.sql",
  ])
    f.db.file(`supabase/migrations/${file}`);
  const execute = (sql, actor = 1, session = 1200) =>
    JSON.parse(
      f.db.sql(
        as(
          actor,
          `set request.jwt.claims='${JSON.stringify({ session_id: id(session) })}'; ${sql}`,
        ),
      ),
    );
  const command = {
    operationId: id(1201),
    installationId: id(1202),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[ReauthenticationFixture]",
  };
  const save = (value) => `select public.nest_save_push_device('${id(10)}',${json(value)})`;
  const revoke = `select public.nest_revoke_previous_push_session('${id(1200)}')`;
  const first = execute(save(command));
  const foreign = execute(revoke, 2, 1300);
  assert.equal(foreign.actorId, id(2));
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), first.revision);
  const own = execute(revoke, 1, 1400);
  assert.deepEqual(own, { version: 1, actorId: id(1), sessionId: id(1200), revoked: true });
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.throws(() => execute(save(command)), /session revoked/);
  const next = execute(
    save({
      ...command,
      operationId: id(1203),
      expectedRevision: f.db.sql("select revision from private.nest_push_devices"),
    }),
    1,
    1400,
  );
  assert.deepEqual(execute(revoke, 1, 1400), own);
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), next.revision);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  execute(`select public.nest_revoke_previous_push_session('${id(1400)}')`, 1, 1500);
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.throws(
    () => execute("select public.nest_revoke_previous_push_session(null)"),
    /Session required/,
  );
  assert.throws(() => f.db.sql(as(1, revoke)), /Authenticated session required/);
  assert.throws(
    () => execute(`select private.nest_revoke_owned_push_session('${id(1200)}')`),
    /permission denied/,
  );
});
