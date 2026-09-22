import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json, as } from "./renewal-fixture.mjs";
test("push enrollment is private, revision-bound and retry-safe across disable and account changes", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  const base = {
    operationId: id(950),
    installationId: id(951),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[Fixture_ONLY]",
  };
  const save = (command, actor = 1) =>
    JSON.parse(
      f.db.sql(as(actor, `select public.nest_save_push_device('${id(10)}',${json(command)})`)),
    );
  const receipt = save(base);
  assert.deepEqual(save(base), receipt);
  assert.equal(JSON.stringify(receipt).includes(base.token), false);
  assert.throws(() => save({ ...base, token: "changed" }), /operation changed/);
  assert.throws(() => save({ ...base, operationId: id(952) }), /registration changed/);
  assert.throws(() => save({ ...base, operationId: id(953) }, 2), /Installation unavailable/);
  const disabled = save({
    operationId: id(954),
    installationId: base.installationId,
    expectedRevision: receipt.revision,
    action: "disable",
  });
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  assert.deepEqual(save(base), receipt, "historical registration retry never re-enables token");
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  const partner = save({ ...base, operationId: id(955) }, 2);
  assert.equal(partner.actorId, id(2));
  assert.throws(
    () =>
      save({
        operationId: id(956),
        installationId: base.installationId,
        expectedRevision: disabled.revision,
        action: "disable",
      }),
    /Installation unavailable/,
  );
  for (const role of ["anon", "authenticated", "service_role"])
    for (const table of ["nest_push_devices", "nest_push_device_operations"])
      assert.throws(
        () => f.db.sql(`set role ${role}; select * from private.${table}`),
        /permission denied/,
      );
  assert.throws(
    () => save({ ...base, installationId: id(957), operationId: id(958) }, 2),
    /duplicate key/,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "3");
});

test("concurrent enrollment shares one receipt and receipt failure rolls token writes back", async (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  const command = {
    operationId: id(960),
    installationId: id(961),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[ConcurrentFixture]",
  };
  const request = as(1, `select public.nest_save_push_device('${id(10)}',${json(command)})`);
  const results = await Promise.all(Array.from({ length: 4 }, () => f.db.concurrent(request)));
  const receipt = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), receipt);
  assert.equal(f.db.sql("select count(*) from private.nest_push_devices"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "1");
  f.db.sql(
    `alter table private.nest_push_device_operations add constraint reject_fixture_operation check(operation_id<>'${id(962)}')`,
  );
  const rotate = {
    ...command,
    operationId: id(962),
    expectedRevision: receipt.revision,
    token: "ExponentPushToken[RejectedRotation]",
  };
  assert.throws(
    () => f.db.sql(as(1, `select public.nest_save_push_device('${id(10)}',${json(rotate)})`)),
    /reject_fixture_operation/,
  );
  assert.equal(f.db.sql("select token from private.nest_push_devices"), command.token);
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), receipt.revision);
  assert.throws(
    () => f.db.sql("delete from private.nest_push_device_operations"),
    /immutable|append.only|cannot|not allowed/i,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.db.sql(request), /Membership required/);
});
