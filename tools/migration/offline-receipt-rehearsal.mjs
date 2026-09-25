import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

// Uses existing synthetic rows only, immediately before the final committed freeze.
export function seedOfflineReceipts(db) {
  db.sql(
    as(
      1,
      `select public.nest_complete_chore('${id(1210)}','${id(1800)}','2026-09-21','2026-09-21');
    select public.nest_set_grocery_checked('${id(10)}','${id(1801)}','${id(810)}',1,true);`,
    ),
  );
  const snapshot = readOfflineReceipts(db, 1);
  assert.equal(snapshot.chores.length, 1);
  assert.equal(snapshot.groceries.length, 1);
  return snapshot;
}
export function verifyFrozenOfflineReceipts(db, expected) {
  assert.deepEqual(readOfflineReceipts(db, 1), expected);
  for (const actor of [2, 3])
    assert.deepEqual(readOfflineReceipts(db, actor), { chores: [], groceries: [] });
  assert.equal(
    db.sql(`select native_version from public.grocery_items where id='${id(810)}'`),
    "2",
  );
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `select public.nest_set_grocery_checked('${id(10)}','${id(1802)}','${id(810)}',2,false)`,
        ),
      ),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(
        as(
          1,
          `select public.nest_complete_chore('${id(1210)}','${id(1803)}','2026-09-21','2026-09-21')`,
        ),
      ),
    /permission denied/,
  );
  return { ownerReceiptsPreserved: true, otherActorsDenied: true, newWritesRefused: true };
}
function readOfflineReceipts(db, actor) {
  return JSON.parse(
    db.sql(
      as(
        actor,
        `select jsonb_build_object(
    'chores',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.nest_chore_receipts r where operation_id='${id(1800)}'),
    'groceries',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.nest_grocery_check_receipts r where operation_id='${id(1801)}'))`,
      ),
    ),
  );
}
