import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { mealPreparationEditOwner } from "../src/meals/preparation-edit-owner.ts";
const id = "ABCDEF00-0000-4000-8000-000000000001";
test("preparation editor owner freezes target and disposes only after its last subscriber", async () => {
  const target = { entryId: id, weekStart: "2030-01-07" };
  const client = { meals: { read: () => Effect.never }, routines: {} };
  const owner = mealPreparationEditOwner(client, target, () => id);
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
