import assert from "node:assert/strict";
import { test } from "node:test";
import { backend, id, run } from "./native-proposal-edit-fixture.mjs";
import { freezeProposals, proposalSnapshot } from "./meal-proposal-freeze-fixture.mjs";
const target = (proposal) => ({
  action: "replace",
  proposalId: proposal.proposalId,
  expectedRevision: proposal.revision,
  entryId: proposal.entries[0].entryId,
});

for (const frozen of [false, true]) {
  test(`native replacement survives lost completion and SQLite restart (frozen=${frozen})`, async (t) => {
    const f = await backend(t),
      runtime = f.create();
    await runtime.load();
    await runtime.start(false);
    const preview = runtime.getSnapshot().proposal;
    await runtime.edit(target(preview));
    assert.equal(f.proxy.dropped(), 1);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(f.provider.calls.length, 4);
    await runtime.approve("2", preview.proposalId);
    assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "0");
    const before = proposalSnapshot(f.remote.db);
    if (frozen) freezeProposals(f.remote.db);
    runtime.dispose();
    const reopened = f.sqlite.reopen(),
      next = f.create(reopened.store);
    await next.load();
    const updated = next.getSnapshot().proposal;
    assert.equal(updated.revision, "3");
    assert.equal(next.getSnapshot().attempt.edit, undefined);
    assert.equal(updated.entries[0].source.kind, "saved");
    assert.deepEqual(updated.entries.slice(1), preview.entries.slice(1));
    assert.equal(f.provider.calls.length, 4);
    const metadata = reopened.connection
      .prepare("select data from meal_proposal_attempts")
      .get().data;
    for (const privateText of ["instructions", "Vegetarian", "workerId", "stateHash"])
      assert.equal(metadata.includes(privateText), false);
    assert.equal(proposalSnapshot(f.remote.db), before);
    if (frozen) return;
    await next.approve("3", preview.proposalId);
    assert.equal(next.getSnapshot().proposal.status, "approved");
    assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "7");
    assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
  });
}

test("native explicit favorite uses one suitability check; stale library and revoked membership fail safely", async (t) => {
  const f = await backend(t, "unused"),
    runtime = f.create();
  await runtime.load();
  await runtime.start(false);
  const preview = runtime.getSnapshot().proposal,
    library = await run(f.client.library.read());
  const choice = {
    ...target(preview),
    action: "choose",
    definitionId: id(200),
    expectedLibraryRevision: library.revision,
  };
  await runtime.edit(choice);
  assert.equal(runtime.getSnapshot().proposal.revision, "3");
  assert.equal(f.provider.calls.length, 3);
  assert.equal(runtime.getSnapshot().proposal.entries[0].source.recipe.definitionId, id(200));
  await runtime.edit({ ...choice, expectedRevision: "3" });
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(runtime.getSnapshot().attempt.edit, undefined);
  assert.equal(f.provider.calls.length, 3);
  await runtime.load();
  const changed = { ...choice, expectedRevision: "3", entryId: preview.entries[1].entryId };
  f.remote.db.sql(`update public.meal_definitions set name='Changed' where id='${id(200)}'`);
  await runtime.edit(changed);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(runtime.getSnapshot().attempt.edit, undefined);
  assert.equal(f.provider.calls.length, 3);
  await runtime.load();
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.edit({
    ...target(runtime.getSnapshot().proposal),
    entryId: preview.entries[1].entryId,
  });
  assert.equal(runtime.getSnapshot().access, "verify");
  assert.equal(runtime.getSnapshot().proposal, null);
  assert.equal(f.provider.calls.length, 3);
});
