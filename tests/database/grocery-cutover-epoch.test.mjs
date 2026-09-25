import assert from "node:assert/strict";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claim.sub='${id(actor)}'; ${sql}`;
const command = (operation) => ({
  operationId: id(operation),
  itemId: id(100),
  expectedVersion: "1",
  checked: true,
});
const request = (value, epoch) => `select public.nest_check_grocery_at_epoch(
  '${id(10)}','${JSON.stringify(value)}'::jsonb,${epoch ? `'${epoch}'` : "null"})`;
const old = (operation) => `select public.nest_set_grocery_checked(
  '${id(10)}','${id(operation)}','${id(100)}',1,true)`;

function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/grocery-fixture.sql");
  db.sql("create role service_role bypassrls");
  for (const file of [
    "20260919214311_native_grocery_check_receipts.sql",
    "20260925185000_native_household_write_barrier.sql",
    "20260925202107_native_offline_cutover_epoch.sql",
    "20260925202540_native_grocery_epoch_command.sql",
  ])
    db.file(`supabase/migrations/${file}`);
  db.sql(`insert into public.grocery_items(id,household_id,name)
    values('${id(100)}','${id(10)}','Milk')`);
  return db;
}

test("grocery cutover recovers committed receipts but fences unreceived old commands", (t) => {
  const db = fixture(t);
  const epoch = db.sql("select offline_epoch from private.nest_household_write_control");
  const receipt = JSON.parse(db.sql(as(1, old(200))));
  db.sql("select private.nest_set_household_writes_frozen(true)");
  const rotated = db.sql("select private.nest_rotate_offline_epoch()");
  assert.deepEqual(JSON.parse(db.sql(as(1, request(command(200), epoch)))), receipt);
  db.sql("select private.nest_set_household_writes_frozen(false)");
  assert.deepEqual(JSON.parse(db.sql(as(1, old(200)))), receipt);
  for (const sql of [old(201), request(command(201), epoch), request(command(201), null)])
    assert.throws(() => db.sql(as(1, sql)), /reconciliation/);
  assert.throws(
    () => db.sql(as(1, request({ ...command(200), checked: false }, epoch))),
    /Operation payload changed/,
  );
  assert.throws(() => db.sql(as(2, request(command(200), epoch))), /reconciliation/);
  assert.throws(() => db.sql(as(3, request(command(200), epoch))), /Not authorized/);
  const fresh = request(command(202), rotated);
  const applied = JSON.parse(db.sql(as(1, fresh)));
  assert.deepEqual(JSON.parse(db.sql(as(1, fresh))), applied);
  assert.equal(db.sql("select count(*) from public.nest_grocery_check_receipts"), "2");
  assert.equal(db.sql("select native_version from public.grocery_items"), "2");
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () =>
        db.sql(`set role ${role}; select
      private.nest_set_grocery_checked_before_epoch('${id(10)}','${id(203)}','${id(100)}',1,true)`),
      /permission denied/,
    );
});
