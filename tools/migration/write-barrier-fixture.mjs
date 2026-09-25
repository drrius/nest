// Test adapters only; never accepts a hosted connection or activates production.
export function installFixtureWriteBarrier(db) {
  db.file("supabase/migrations/20260925185000_native_household_write_barrier.sql");
}
export function setFixtureWritesFrozen(db, frozen) {
  if (typeof frozen !== "boolean") throw new Error("Explicit fixture freeze state required");
  db.sql(`select private.nest_set_household_writes_frozen(${frozen})`);
}
export function verifyFixtureWriteBarrier(db) {
  db.sql("select private.nest_assert_household_write_barrier()");
}
