import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json, as } from "./renewal-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  for (const name of [
    "20260922223732_native_push_registration",
    "20260922230403_native_push_logout",
    "20260922235848_native_push_cancellation",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const request = (sql, actor = 1) =>
    as(actor, `set request.jwt.claims='${JSON.stringify({ session_id: id(1400) })}'; ${sql}`);
  const execute = (sql, actor = 1) => JSON.parse(f.db.sql(request(sql, actor)));
  const command = (op) => ({
    operationId: id(op),
    installationId: id(1401),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[CancellationFixture]",
  });
  const save = (value) => `select public.nest_save_push_device('${id(10)}',${json(value)})`;
  const cancel = (op) => `select public.nest_cancel_push_device_operation('${id(10)}','${id(op)}')`;
  const read = (op) => `select public.nest_read_push_device_operation('${id(10)}','${id(op)}')`;
  return { ...f, request, execute, command, save, cancel, read };
}
test("cancellation permanently fences late commands without changing a device", (t) => {
  const f = setup(t);
  const result = f.execute(f.cancel(1410));
  assert.equal(result.status, "cancelled");
  assert.equal(result.receipt, null);
  assert.deepEqual(f.execute(f.cancel(1410)), result);
  assert.deepEqual(f.execute(f.read(1410)), result);
  assert.throws(() => f.execute(f.save(f.command(1410))), /operation cancelled/);
  assert.throws(
    () => f.execute(f.save({ ...f.command(1410), installationId: id(1402) })),
    /operation cancelled/,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_devices"), "0");
  const receipt = f.execute(f.save(f.command(1411)));
  const recorded = f.execute(f.cancel(1411));
  assert.equal(recorded.status, "recorded");
  assert.deepEqual(recorded.receipt, receipt);
  assert.equal(f.db.sql("select revision from private.nest_push_devices"), receipt.revision);
});
test("cancellation is actor scoped and inaccessible after leaving the household", (t) => {
  const f = setup(t);
  f.execute(f.cancel(1420), 2);
  assert.equal(f.execute(f.read(1420)).status, "unresolved");
  assert.equal(f.execute(f.save(f.command(1420))).actorId, id(1));
  assert.throws(() => f.execute(f.cancel(1421), 3), /Membership required/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.execute(f.cancel(1420)), /Membership required/);
  assert.throws(() => f.execute(f.read(1420)), /Membership required/);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_push_cancelled_operations`),
      /permission denied/,
    );
});
test("concurrent save and cancel establish exactly one permanent outcome", async (t) => {
  const f = setup(t);
  const results = await Promise.allSettled([
    f.db.concurrent(f.request(f.save(f.command(1430)))),
    f.db.concurrent(f.request(f.cancel(1430))),
  ]);
  assert.equal(results[1].status, "fulfilled");
  const result = f.execute(f.read(1430));
  if (result.status === "cancelled") {
    assert.equal(results[0].status, "rejected");
    assert.equal(f.db.sql("select count(*) from private.nest_push_devices"), "0");
    assert.throws(() => f.execute(f.save(f.command(1430))), /operation cancelled/);
  } else {
    assert.equal(result.status, "recorded");
    assert.equal(results[0].status, "fulfilled");
    assert.deepEqual(f.execute(f.save(f.command(1430))), result.receipt);
  }
  assert.deepEqual(f.execute(f.cancel(1430)), result);
});
test("cancellation persistence failure rolls back and fences cannot be removed", (t) => {
  const f = setup(t);
  f.db.sql(
    "alter table private.nest_push_cancelled_operations add constraint fixture_no_cancel check(false)",
  );
  assert.throws(() => f.execute(f.cancel(1440)), /fixture_no_cancel/);
  assert.equal(f.execute(f.read(1440)).status, "unresolved");
  f.db.sql("alter table private.nest_push_cancelled_operations drop constraint fixture_no_cancel");
  f.execute(f.cancel(1440));
  assert.throws(() => f.db.sql("delete from private.nest_push_cancelled_operations"));
  assert.equal(f.execute(f.read(1440)).status, "cancelled");
  assert.throws(
    () => f.execute(`select public.nest_cancel_push_device_operation('${id(10)}',null)`),
    /Invalid operation/,
  );
  assert.throws(
    () =>
      f.execute(
        `select private.nest_save_push_device_session('${id(10)}',${json(f.command(1441))})`,
      ),
    /permission denied/,
  );
});
