import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fixture, id, editInput, editOutcome, replacement } from "./meal-proposal-edit-fixture.mjs";
async function heldLock(f, sql, name) {
  const pending = f.db.concurrent(
    `set application_name='${name}'; begin; ${sql}; select pg_sleep(0.8); commit`,
  );
  for (let attempt = 0; ; attempt++) {
    if (
      f.db.sql(
        `select count(*) from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'`,
      ) === "1"
    )
      break;
    assert.ok(attempt < 150);
    await setTimeout(5);
  }
  return { pending };
}
test("edit completion rechecks deadline after waiting for the week lock", async (t) => {
  const f = fixture(t),
    p = f.ready(),
    before = f.read(p);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  f.db.sql(
    "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()+interval '500 milliseconds'",
  );
  const held = await heldLock(
    f,
    `select revision from public.nest_meal_week_revisions where household_id='${id(10)}' for update`,
    "edit-expiry-lock",
  );
  const result = JSON.parse((await f.db.concurrent(f.finishEditCommand(id(880)))).stdout);
  await held.pending;
  assert.equal(result.failure, "unavailable");
  assert.deepEqual(f.read(p), before);
  assert.deepEqual(f.finishEdit(id(880)), result);
});
test("in-flight partner food changes prevent replacement using stale constraints", async (t) => {
  const f = fixture(t),
    p = f.ready(),
    before = f.read(p);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  const held = await heldLock(
    f,
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
    "edit-food-lock",
  );
  assert.equal(f.finishEdit(id(880)).failure, "constraints_changed");
  await held.pending;
  assert.deepEqual(f.read(p), before);
});
test("old successful edit replay never reverses a subsequent replacement or approval", (t) => {
  const f = fixture(t),
    p = f.ready();
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  const first = f.finishEdit(id(880));
  f.beginEdit(id(881), editInput(p, { expectedRevision: "3", entryId: id(953) }));
  f.claimEdit(id(881));
  const next = replacement({ entryId: id(953), date: "2030-01-08" });
  f.finishEdit(id(881), editOutcome(next));
  const current = f.read(p);
  assert.deepEqual(f.finishEdit(id(880)), first);
  assert.deepEqual(f.read(p), current);
  f.approve(id(882), { proposalId: p, expectedRevision: "4" });
  assert.deepEqual(f.finishEdit(id(880)), first);
  assert.equal(f.read(p).proposal.status, "approved");
  assert.equal(f.read(p).proposal.revision, "5");
});
