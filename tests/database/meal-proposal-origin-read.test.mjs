import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as editFixture, id, as, editInput } from "./meal-proposal-edit-fixture.mjs";
function fixture(t) {
  const f = editFixture(t);
  f.db.file("supabase/migrations/20260921072749_native_meal_proposal_handoff.sql");
  f.db.file("supabase/migrations/20260925194847_native_meal_proposal_origin_read.sql");
  const read = (p, actor = id(1), home = id(10)) =>
    JSON.parse(
      f.db.sql(
        `begin read only; ${as(`select public.nest_read_meal_proposal_origin('${home}','${p}')`, actor)}; rollback;`,
      ),
    );
  return { ...f, origin: read };
}
test("origin read works in a readonly transaction without expiring generation and preserves edited/approved state", (t) => {
  const f = fixture(t),
    receipt = f.begin(id(800)),
    p = receipt.proposalId;
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second' where proposal_id='${p}'`,
  );
  const expired = f.origin(p);
  assert.deepEqual(expired.receipt, receipt);
  assert.equal(expired.envelope.proposal.status, "generating");
  assert.equal(f.db.sql("select revision from private.nest_meal_proposals"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_jobs"), "0");
  const ready = f.ready(id(801));
  f.beginEdit(id(880), editInput(ready));
  f.claimEdit(id(880));
  f.finishEdit(id(880));
  const edited = f.origin(ready);
  assert.equal(edited.envelope.proposal.revision, "3");
  assert.deepEqual(edited.envelope, f.read(ready));
  f.approve(id(881), { proposalId: ready, expectedRevision: "3" });
  assert.equal(f.origin(ready).envelope.proposal.status, "approved");
  assert.deepEqual(f.origin(ready).receipt, edited.receipt);
});
test("origin read requires current owner membership, refuses API roles and fails on missing origin", (t) => {
  const f = fixture(t),
    p = f.ready();
  for (const [actor, home] of [
    [id(2), id(10)],
    [id(3), id(10)],
    [id(1), id(20)],
  ])
    assert.throws(() => f.origin(p, actor, home), /changed|authorized/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role};select public.nest_read_meal_proposal_origin('${id(10)}','${p}')`,
        ),
      /permission denied/,
    );
  f.db.sql(
    `delete from private.nest_meal_proposal_receipts where result->>'proposalId'='${p}' and result ? 'expectedWeekRevision'`,
  );
  assert.throws(() => f.origin(p), /origin unavailable/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.origin(p), /authorized/);
});
