import assert from "node:assert/strict";
import { as, id } from "../../tests/database/native-expense-helpers.mjs";

// Uses existing synthetic rows only, immediately before the final committed freeze.
export function seedOfflineReceipts(db) {
  const count = Number(db.sql("select count(*) from public.routine_completions"));
  const completed = JSON.parse(
    db.sql(
      as(
        2,
        `select public.nest_complete_chore('${id(1212)}','${id(1800)}','2026-09-24','2026-09-24')`,
      ),
    ),
  );
  assert.equal(completed.outcome, "completed");
  assert.equal(completed.completedBy, id(2));
  assert.equal(Number(db.sql("select count(*) from public.routine_completions")), count + 1);
  db.sql(
    as(1, `select public.nest_set_grocery_checked('${id(10)}','${id(1801)}','${id(810)}',1,true)`),
  );
  const snapshot = {
    first: readOfflineReceipts(db, 1),
    second: readOfflineReceipts(db, 2),
    routines: captureNativeRoutineHistory(db),
  };
  assert.equal(snapshot.first.chores.length, 0);
  assert.equal(snapshot.first.groceries.length, 1);
  assert.equal(snapshot.second.chores.length, 1);
  assert.equal(snapshot.second.groceries.length, 0);
  return snapshot;
}
export function verifyFrozenOfflineReceipts(db, expected) {
  assert.deepEqual(readOfflineReceipts(db, 1), expected.first);
  assert.deepEqual(readOfflineReceipts(db, 2), expected.second);
  assert.deepEqual(readOfflineReceipts(db, 3), { chores: [], groceries: [] });
  assert.equal(captureNativeRoutineHistory(db), expected.routines);
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
  return {
    ownerReceiptsPreserved: true,
    otherActorsDenied: true,
    newWritesRefused: true,
    newChoreCompletionPreserved: true,
  };
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

function captureNativeRoutineHistory(db) {
  return db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
    'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c)
  )`);
}
