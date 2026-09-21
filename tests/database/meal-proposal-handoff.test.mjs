import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as editFixture, id, as, editInput } from "./meal-proposal-edit-fixture.mjs";
import { Schema } from "./recipe-selection-fixture.mjs";
import { MealProposalGenerationResult } from "../../packages/contracts/src/meal-proposals.ts";
function fixture(t) {
  const f = editFixture(t);
  f.db.file("supabase/migrations/20260921072749_native_meal_proposal_handoff.sql");
  const open = (p, actor = id(1), home = id(10)) =>
    Schema.decodeUnknownSync(MealProposalGenerationResult)(
      JSON.parse(f.db.sql(as(`select public.nest_open_meal_proposal('${home}','${p}')`, actor))),
      { onExcessProperty: "error" },
    );
  return { ...f, open };
}
test("handoff pairs the immutable origin with current edited and approved content", (t) => {
  const f = fixture(t),
    receipt = f.begin(id(800)),
    p = receipt.proposalId;
  assert.deepEqual(f.open(p).receipt, receipt);
  assert.equal(f.open(p).envelope.proposal.status, "generating");
  f.claim(p);
  f.finish(p);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  f.finishEdit(id(880));
  const opened = f.open(p);
  assert.deepEqual(opened.receipt, receipt);
  assert.equal(opened.envelope.proposal.revision, "3");
  assert.deepEqual(opened.envelope, f.read(p));
  f.approve(id(881), { proposalId: p, expectedRevision: "3" });
  assert.deepEqual(f.open(p).receipt, receipt);
  assert.equal(f.open(p).envelope.proposal.status, "approved");
  for (const secret of ["constraints_hash", "worker_id", "stateHash", "selected_source"])
    assert.equal(JSON.stringify(opened).includes(secret), false);
});
test("handoff requires current owner membership even for historical requests", (t) => {
  const f = fixture(t),
    p = f.ready();
  for (const [actor, home] of [
    [id(2), id(10)],
    [id(3), id(10)],
    [id(1), id(20)],
  ])
    assert.throws(() => f.open(p, actor, home), /changed|authorized/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role};select public.nest_open_meal_proposal('${id(10)}','${p}')`),
      /permission denied/,
    );
  f.discard(id(881), p, "2");
  assert.equal(f.open(p).envelope.proposal.status, "discarded");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.open(p), /authorized/);
});
test("opening expired generation recovers failure without claiming or starting model work", (t) => {
  const f = fixture(t),
    receipt = f.begin(id(800)),
    p = receipt.proposalId;
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second' where proposal_id='${p}'`,
  );
  const result = f.open(p);
  assert.deepEqual(result.receipt, receipt);
  assert.equal(result.envelope.proposal.failure, "unavailable");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_jobs"), "0");
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
  assert.deepEqual(f.open(p), result);
});
