import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { mealPreparationOwner } from "../src/meals/preparation-owner.ts";
import { preparationTarget } from "../src/meals/preparation-target.ts";
import { parsePreparationDraft, preparationDraftDirty } from "../src/meals/preparation-draft.ts";
const id = "ABCDEF00-0000-4000-8000-000000000001";
test("preparation owner freezes target and disposes only after its last subscriber", async () => {
  const target = { entryId: id, weekStart: "2030-01-07" };
  const client = { meals: { read: () => Effect.never }, routines: {} };
  const owner = mealPreparationOwner(client, target, () => id);
  target.weekStart = "2030-01-14";
  assert.equal(owner.getSnapshot(), null);
  const unsubscribe = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  const other = owner.subscribe(() => {});
  assert.deepEqual(first.target, { entryId: id.toLowerCase(), weekStart: "2030-01-07" });
  unsubscribe();
  assert.equal(owner.getSnapshot(), first);
  other();
  assert.equal(owner.getSnapshot(), null);
  const next = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(second, first);
  const before = first.getSnapshot();
  await first.load();
  assert.equal(first.getSnapshot(), before);
  next();
  assert.equal(owner.getSnapshot(), null);
});
test("preparation links reject malformed dates and repeated identities", () => {
  assert.deepEqual(preparationTarget({ entryId: id, weekStart: "2030-01-07" }), {
    entryId: id.toLowerCase(),
    weekStart: "2030-01-07",
  });
  for (const target of [
    { entryId: [id, id], weekStart: "2030-01-07" },
    { entryId: id, weekStart: "2030-01-08" },
    { entryId: id, weekStart: "2030-02-30" },
    { entryId: "foreign", weekStart: "2030-01-07" },
  ])
    assert.equal(preparationTarget(target), null);
});
test("preparation draft preserves instructions, assignment and unsaved date changes", () => {
  const draft = { title: "", instructions: "", dueOn: "2030-01-07", policy: "shared", member: "" };
  assert.equal(preparationDraftDirty(draft, draft.dueOn), false);
  assert.equal(parsePreparationDraft(draft)._tag, "Failure");
  for (const patch of [
    { title: "Soak" },
    { instructions: "Leave overnight" },
    { dueOn: "2030-01-06" },
    { policy: "assigned" },
  ])
    assert.equal(preparationDraftDirty({ ...draft, ...patch }, draft.dueOn), true);
  const parsed = parsePreparationDraft({
    ...draft,
    title: "Soak beans",
    policy: "assigned",
    member: id,
    instructions: "  Keep this spacing\n",
  });
  assert.equal(parsed._tag, "Success");
  assert.equal(parsed.value.instructions, "  Keep this spacing\n");
  assert.equal(parsed.value.assignment.memberId, id);
  assert.equal(parsePreparationDraft({ ...draft, title: "Soak" }).value.instructions, null);
});
