import test from "node:test";
import assert from "node:assert/strict";
import { apnsRegistrationFixture, id } from "./apns-registration-fixture.mjs";
test("APNs reads remain private with RLS, invoker wrappers and no privileged-client mutation path", (t) => {
  const f = apnsRegistrationFixture(t),
    base = f.command();
  f.execute(f.save(base));
  const state = f.execute(f.read());
  assert.equal(state.provider, "apns");
  assert.equal(state.environment, "sandbox");
  assert.equal(JSON.stringify(state).includes(base.token), false);
  assert.equal(f.execute(f.read(), 2).revision, null);
  assert.equal(f.execute(f.recover(), 2).status, "unresolved");
  assert.throws(() => f.execute(f.read(), 3), /Membership required/);
  assert.throws(
    () => f.execute(f.save({ ...base, operationId: id(2731) }), 3),
    /Membership required/,
  );
  assert.equal(
    f.db.sql(
      "select prosecdef from pg_proc where oid='public.nest_read_push_device(uuid,uuid)'::regprocedure",
    ),
    "f",
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const table of ["nest_push_devices", "nest_push_device_operations"])
      assert.throws(
        () => f.db.sql(`set role ${role}; select * from private.${table}`),
        /permission denied/,
      );
    assert.throws(
      () => f.db.sql(`set role ${role}; ${f.save(base).replace("public.", "private.")}`),
      /permission denied/,
    );
  }
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.execute(f.read()), /Membership required/);
  assert.throws(() => f.execute(f.recover()), /Membership required/);
});
test("the legacy begin path cannot claim an APNs registration or release its token", (t) => {
  const f = apnsRegistrationFixture(t);
  const state = f.execute(f.read(1702));
  const base = { ...f.command(2732, 1702), expectedRevision: state.revision };
  f.execute(f.save(base));
  const delivery = f.prepare();
  assert.ok(delivery);
  assert.equal(f.begin(delivery), null);
  assert.equal(
    f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
    "ready",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "0");
  assert.throws(
    () =>
      f.db.sql(
        `set role service_role; select private.nest_begin_expo_push_delivery('${delivery}')`,
      ),
    /permission denied/,
  );
  const native = f.execute(f.read(1702));
  const {
    provider: _,
    environment: __,
    ...legacy
  } = {
    ...base,
    operationId: id(2733),
    expectedRevision: native.revision,
    token: "ExponentPushToken[LegacyGuardRegression]",
  };
  f.execute(f.save(legacy));
  const fresh = f.prepare();
  assert.equal(
    f.begin(fresh).token,
    legacy.token,
    "the Expo path still works for Expo registrations",
  );
});
