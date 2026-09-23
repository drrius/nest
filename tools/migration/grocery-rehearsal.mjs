import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedGroceryRehearsal(db) {
  db.sql(`insert into public.shopping_sessions(id,household_id,member_id,started_at,finished_at)
    values('${id(800)}','${id(10)}','${id(1)}','2026-09-20',null),
      ('${id(801)}','${id(10)}','${id(2)}','2026-09-19','2026-09-20');
    insert into public.grocery_items(id,household_id,name,quantity,unit,sort_order,state,claimed_by_session_id,purchased_at,removed_at)
    values('${id(810)}','${id(10)}','Synthetic active','2','bags',0,'active',null,null,null),
      ('${id(811)}','${id(10)}','Synthetic claimed','1','pack',1,'claimed','${id(800)}',null,null),
      ('${id(812)}','${id(10)}','Synthetic purchased','3','pieces',2,'purchased',null,'2026-09-20',null),
      ('${id(813)}','${id(10)}','Synthetic removed',null,null,3,'removed',null,null,'2026-09-20');
    insert into public.shopping_session_items(household_id,shopping_session_id,grocery_item_id,claimed_at,purchased_at)
    values('${id(10)}','${id(800)}','${id(811)}','2026-09-20',null),
      ('${id(10)}','${id(801)}','${id(812)}','2026-09-19','2026-09-20');`);
}
export function captureGroceryHistory(db) {
  return db.sql(`select jsonb_build_object(
    'items', (select jsonb_agg(to_jsonb(g)-'native_checked'-'native_version' order by id) from public.grocery_items g),
    'sessions', (select jsonb_agg(to_jsonb(s) order by id) from public.shopping_sessions s),
    'claims', (select jsonb_agg(to_jsonb(c) order by shopping_session_id,grocery_item_id) from public.shopping_session_items c)
  )`);
}
export function verifyGroceryRehearsal(db, before) {
  if (captureGroceryHistory(db) !== before)
    throw new Error("Retained grocery/session history changed");
  const snapshot = JSON.parse(
    db.sql(`set role authenticated;
    set request.jwt.claim.sub='${id(1)}'; select public.nest_grocery_snapshot('${id(10)}')`),
  );
  assert.equal(snapshot.total, 2);
  assert.deepEqual(
    snapshot.items.map((item) => ({
      id: item.itemId,
      checked: item.checked,
      state: item.legacyState,
      quantity: item.quantity,
      unit: item.unit,
    })),
    [
      { id: id(810), checked: false, state: "active", quantity: "2", unit: "bags" },
      { id: id(811), checked: false, state: "claimed", quantity: "1", unit: "pack" },
    ],
  );
  const openSessions = Number(
    db.sql("select count(*) from public.shopping_sessions where finished_at is null"),
  );
  assert.equal(openSessions, 1);
  return {
    passed: true,
    retainedItems: 4,
    retainedSessions: 2,
    retainedClaims: 2,
    liveUncheckedItems: snapshot.total,
    openSessions,
  };
}
