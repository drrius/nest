import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  id,
  editInput,
  replacement,
  editOutcome,
  savedSource,
  content,
} from "./meal-proposal-edit-fixture.mjs";

test("concurrent duplicate edit has one claim, changes only its target, and retains immutable replay", async (t) => {
  const f = fixture(t),
    p = f.ready(),
    input = editInput(p),
    op = id(880),
    before = f.read(p).proposal;
  const starts = await Promise.all(
    Array.from({ length: 3 }, () => f.db.concurrent(f.beginEditCommand(op, input))),
  );
  const pending = f.beginEdit(op, input);
  for (const r of starts) assert.deepEqual(JSON.parse(r.stdout), pending);
  assert.equal(pending.status, "pending");
  const claims = await Promise.all(
    Array.from({ length: 4 }, (_, i) => f.db.concurrent(f.claimEditCommand(op, id(890 + i)))),
  );
  const winners = claims.map((r) => JSON.parse(r.stdout)).filter((r) => r.claimed);
  assert.equal(winners.length, 1);
  const result = editOutcome(replacement(), { workerId: winners[0].worker.id });
  assert.equal(f.claimEdit(op, winners[0].worker.id).claimed, false);
  const replies = await Promise.all(
    Array.from({ length: 3 }, () => f.db.concurrent(f.finishEditCommand(op, result))),
  );
  const applied = f.finishEdit(op, result);
  for (const r of replies) assert.deepEqual(JSON.parse(r.stdout), applied);
  assert.equal(applied.status, "applied");
  const after = f.read(p).proposal;
  assert.equal(after.revision, "3");
  assert.deepEqual(after.entries, [replacement(), ...before.entries.slice(1)]);
  for (const table of ["meal_plan_entries", "grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  f.discard(id(881), p, "3");
  assert.deepEqual(f.finishEdit(op, result), applied);
  assert.deepEqual(f.beginEdit(op, input), applied);
  assert.throws(
    () =>
      f.finishEdit(
        op,
        editOutcome(replacement({ estimatedCaloriesPerServing: 777 }), {
          workerId: winners[0].worker.id,
        }),
      ),
    /changed/,
  );
});

test("different pending intents cannot pay for concurrent generation of the same revision", async (t) => {
  const f = fixture(t),
    p = f.ready();
  const attempts = await Promise.allSettled(
    [880, 881].map((n) => f.db.concurrent(f.beginEditCommand(id(n), editInput(p)))),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_edits"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposal_receipts"), "2");
});

test("unclaimed and claimed operations expire without changing the preview or allowing a second claim", (t) => {
  for (const claim of [false, true]) {
    const f = fixture(t),
      p = f.ready(),
      before = f.read(p);
    f.beginEdit(id(880), editInput(p));
    if (claim) f.claimEdit(id(880));
    f.db.sql(
      "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()-interval '1 second'",
    );
    assert.equal(f.readEdit(id(880)).failure, "unavailable");
    assert.equal(f.claimEdit(id(880)).claimed, false);
    assert.throws(() => f.finishEdit(id(880)), /changed/);
    assert.deepEqual(f.read(p), before);
    assert.equal(f.beginEdit(id(881), editInput(p)).status, "pending");
  }
});

test("saved choice preserves exact canonical recipe and rejects changed, incomplete or foreign library", (t) => {
  const f = fixture(t),
    source = savedSource(f),
    p = f.ready();
  const input = editInput(p, {
    action: "choose",
    definitionId: id(200),
    expectedLibraryRevision: source.libraryRevision,
  });
  for (const patch of [{ definitionId: id(202) }, { expectedLibraryRevision: "0" }])
    assert.throws(() => f.beginEdit(id(880), { ...input, ...patch }), /changed/);
  f.beginEdit(id(880), input);
  assert.deepEqual(f.claimEdit(id(880)).selection, source);
  const tampered = structuredClone(source);
  tampered.recipe.title = "Invented";
  assert.throws(
    () => f.finishEdit(id(880), editOutcome(replacement({ source: tampered }))),
    /Invalid/,
  );
  const receipt = f.finishEdit(
    id(880),
    editOutcome(replacement({ source, estimatedCaloriesPerServing: null })),
  ).receipt;
  assert.equal(receipt.definitionId, id(200));
  assert.equal(receipt.expectedLibraryRevision, source.libraryRevision);
  assert.throws(() => f.beginEdit(id(881), { ...input, expectedRevision: "3" }), /Same saved/);
  const p2 = f.ready(id(802));
  f.beginEdit(id(881), { ...input, proposalId: p2 });
  f.claimEdit(id(881));
  f.db.sql(`update public.meal_definitions set name='Changed' where id='${id(200)}'`);
  assert.equal(
    f.finishEdit(id(881), editOutcome(replacement({ source }))).failure,
    "constraints_changed",
  );
  assert.equal(f.read(p2).proposal.revision, "2");
});

test("replacement leaves other reviewed saved snapshots intact after library edits", (t) => {
  const f = fixture(t),
    source = savedSource(f),
    body = content();
  body.entries[1].source = source;
  const p = f.ready(id(800), body);
  f.db.sql(
    `update public.meal_definitions set name='Changed',archived_at=now() where id='${id(200)}'`,
  );
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  assert.equal(f.finishEdit(id(880)).status, "applied");
  assert.deepEqual(f.read(p).proposal.entries.slice(1), body.entries.slice(1));
});

test("failed generation and stale food, cooking, roster or week never rewrite the original preview", (t) => {
  const changes = [
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
    `update public.nest_cooking_preferences set meal_slots=array['lunch']`,
    `update public.household_members set joined_at=joined_at+interval '1 second' where user_id='${id(2)}'`,
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(700)}','${id(10)}','2030-01-07','dinner','Occupied')`,
  ];
  for (const change of changes) {
    const f = fixture(t),
      p = f.ready(),
      before = f.read(p);
    f.beginEdit(id(880), editInput(p));
    f.claimEdit(id(880));
    f.db.sql(change);
    assert.equal(f.finishEdit(id(880)).failure, "constraints_changed");
    assert.deepEqual(f.read(p), before);
  }
  const f = fixture(t),
    p = f.ready(),
    before = f.read(p);
  f.beginEdit(id(880), editInput(p));
  f.claimEdit(id(880));
  const failed = f.finishEdit(id(880), editOutcome(null, { failure: "no_suitable_meals" }));
  assert.equal(failed.failure, "no_suitable_meals");
  assert.deepEqual(f.read(p), before);
  assert.equal(f.claimEdit(id(880)).claimed, false);
});
