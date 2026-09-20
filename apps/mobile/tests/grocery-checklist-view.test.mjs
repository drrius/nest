import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistItems } from "../src/groceries/checklist-view.ts";

test("collapsing checked groceries keeps every unsent or conflicting intent visible", () => {
  const items = [
    { itemId: "needed", checked: false, pending: false, conflict: false },
    { itemId: "confirmed", checked: true, pending: false, conflict: false },
    { itemId: "queued", checked: true, pending: true, conflict: false },
    { itemId: "conflict", checked: true, pending: true, conflict: true },
  ];
  assert.deepEqual(
    checklistItems(items, false).map((item) => item.itemId),
    ["needed", "queued", "conflict"],
  );
  assert.deepEqual(checklistItems(items, true), items);
  assert.equal(items.length, 4, "presentation does not mutate the canonical snapshot");
});
