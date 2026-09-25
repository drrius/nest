import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

const readers = ["nest_chore_epoch_snapshot", "nest_grocery_epoch_snapshot"];
export function captureOfflineSnapshots(db) {
  return [1, 2].map((actor) =>
    readers.map((reader) => JSON.parse(db.sql(as(actor, call(reader))))),
  );
}

export function verifyOfflineSnapshots(db, expected) {
  assert.deepEqual(captureOfflineSnapshots(db), expected);
  for (const member of expected) {
    for (const snapshot of member) {
      assert.equal(snapshot.householdId, id(10));
      assert.match(snapshot.offlineEpoch, /^[0-9a-f-]{36}$/);
    }
    assert.ok(member[0].chores.length > 0);
    assert.ok(member[1].items.length > 0);
  }
  for (const reader of readers) {
    assert.throws(() => db.sql(as(3, call(reader))), /Not authorized/);
    for (const role of ["anon", "service_role"]) {
      assert.throws(() => db.sql(`set role ${role}; ${call(reader)}`), /permission denied/);
    }
  }
  return { bothMemberSnapshotsPreserved: true, outsidersDenied: true, epochPreserved: true };
}

function call(reader) {
  return `select public.${reader}('${id(10)}')`;
}
