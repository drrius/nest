import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  id,
  editInput,
  replacement,
  editOutcome,
  content,
  savedSource,
} from "./meal-proposal-edit-fixture.mjs";

test("edit authorization is current and owner-specific; worker and private table access are denied", (t) => {
  const f = fixture(t),
    p = f.ready(),
    input = editInput(p);
  for (const scope of [{ actor: id(2) }, { actor: id(3) }, { home: id(20) }])
    assert.throws(() => f.beginEdit(id(880), input, scope), /changed|authorized/);
  f.beginEdit(id(880), input);
  f.claimEdit(id(880));
  for (const actor of [id(2), id(3)]) {
    assert.throws(() => f.readEdit(id(880), actor), /changed|authorized/);
    assert.throws(() => f.claimEdit(id(880), id(890), actor), /changed|authorized/);
    assert.throws(() => f.finishEdit(id(880), editOutcome(), actor), /changed|authorized/);
  }
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_meal_proposal_edits`),
      /permission denied/,
    );
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () =>
        f.db.sql(f.claimEditCommand(id(880)).replace("set role service_role", `set role ${role}`)),
      /permission denied/,
    );
  f.finishEdit(id(880));
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  for (const action of [
    () => f.beginEdit(id(880), input),
    () => f.readEdit(id(880)),
    () => f.claimEdit(id(880)),
    () => f.finishEdit(id(880)),
  ])
    assert.throws(action, /authorized/);
});

test("strict native commands and shared operation namespace reject injected or reused intent", (t) => {
  const f = fixture(t),
    p = f.ready(),
    input = editInput(p);
  for (const patch of [
    { approved: true },
    { entryId: id(999) },
    { actorId: id(2) },
    { expectedRevision: "1" },
    { expectedRevision: 2 },
    { action: "approve" },
    { expectedRevision: "9223372036854775808" },
    { entryId: null },
    { definitionId: id(200) },
  ])
    assert.throws(() => f.beginEdit(id(880), { ...input, ...patch }), /Invalid|changed/);
  assert.throws(() => f.beginEdit(id(800), input), /operation changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_edits"), "0");
  f.beginEdit(id(880), input);
  assert.throws(() => f.beginEdit(id(880), { ...input, entryId: id(953) }), /operation changed/);
  assert.throws(() => f.discard(id(880), p, "2"), /operation changed/);
  assert.throws(
    () => f.approve(id(880), { proposalId: p, expectedRevision: "2" }),
    /operation changed/,
  );
});

test("completion cannot change target identity, slot, chosen source or accept unchanged content", (t) => {
  const f = fixture(t),
    p = f.ready(),
    before = f.read(p);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  const invalid = [
    replacement({ entryId: id(999) }),
    replacement({ slot: "lunch" }),
    replacement({ date: "2030-01-08" }),
    content().entries[0],
    replacement({ estimatedCaloriesPerServing: 0 }),
    { ...replacement(), approved: true },
  ];
  for (const entry of invalid) {
    assert.throws(() => f.finishEdit(id(880), editOutcome(entry)), /Invalid/);
    assert.deepEqual(f.read(p), before);
  }
  for (const patch of [
    { workerId: id(999) },
    { failure: "incomplete_preferences" },
    { entry: null },
    { approved: true },
  ])
    assert.throws(
      () => f.finishEdit(id(880), editOutcome(replacement(), patch)),
      /Invalid|changed/,
    );
  assert.equal(f.finishEdit(id(880)).status, "applied");
});

test("familiar-only proposals cannot introduce generated recipes", (t) => {
  const f = fixture(t),
    source = savedSource(f),
    body = content();
  body.familiarOnly = true;
  body.entries.forEach((e) => {
    e.source = source;
  });
  const p = f.ready(id(800), body);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  assert.throws(() => f.finishEdit(id(880)), /Invalid recipe source/);
  assert.equal(f.read(p).proposal.revision, "2");
});

test("begin receipt and completion persistence failures roll back all private changes", (t) => {
  const f = fixture(t),
    p = f.ready(),
    input = editInput(p),
    before = f.read(p);
  f.db
    .sql(`create function private.reject_edit() returns trigger language plpgsql as $$begin raise exception 'fixture failure'; end$$;
    create trigger reject_edit before insert on private.nest_meal_proposal_receipts for each row execute function private.reject_edit()`);
  assert.throws(() => f.beginEdit(id(880), input), /fixture failure/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_edits"), "0");
  f.db.sql("drop trigger reject_edit on private.nest_meal_proposal_receipts");
  f.beginEdit(id(880), input);
  f.claimEdit(id(880));
  f.db.sql(
    "create trigger reject_edit before update on private.nest_meal_proposal_edits for each row execute function private.reject_edit()",
  );
  assert.throws(() => f.finishEdit(id(880)), /fixture failure/);
  assert.deepEqual(f.read(p), before);
  assert.equal(f.readEdit(id(880)).status, "pending");
  f.db.sql("drop trigger reject_edit on private.nest_meal_proposal_edits");
  assert.equal(f.finishEdit(id(880)).status, "applied");
});

test("approval or discard races cannot accept an old revision after a successful edit", async (t) => {
  for (const action of ["approve", "discard"]) {
    for (let i = 0; i < 4; i++) {
      const f = fixture(t),
        p = f.ready();
      f.beginEdit(id(880), editInput(p));
      f.claimEdit(id(880));
      const competing =
        action === "approve"
          ? f.approveCommand(id(881), { proposalId: p, expectedRevision: "2" })
          : f.discardCommand(id(881), p, "2");
      await Promise.allSettled([
        f.db.concurrent(f.finishEditCommand(id(880))),
        f.db.concurrent(competing),
      ]);
      const proposal = f.read(p).proposal,
        edit = f.readEdit(id(880));
      assert.equal(proposal.revision, "3");
      if (edit.status === "applied") {
        assert.equal(proposal.status, "ready");
        assert.deepEqual(proposal.entries[0], replacement());
        assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
      } else {
        assert.equal(edit.failure, "constraints_changed");
        assert.equal(proposal.status, action === "approve" ? "approved" : "discarded");
        assert.deepEqual(proposal.entries, content().entries);
      }
    }
  }
});
