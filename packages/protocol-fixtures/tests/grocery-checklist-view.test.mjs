import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { checklistItems, checklistRows } from "../src/groceries/checklist-view.ts";

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

test("grouping keeps pending/conflicted checks, skips empty headings, and separates same-name category identities", () => {
  const item = (itemId, patch = {}) => ({
    itemId,
    checked: false,
    pending: false,
    conflict: false,
    categoryId: null,
    ...patch,
  });
  const items = [
    item("apple", { categoryId: "a", categoryName: "Produce" }),
    item("carrot", { categoryId: "a", categoryName: "Produce", checked: true, pending: true }),
    item("milk", { categoryId: "b", categoryName: "Dairy", checked: true }),
    item("unknown", { categoryId: "removed", categoryName: null }),
    item("pear", { categoryId: "other-a", categoryName: "Produce", checked: true, conflict: true }),
  ];
  const grouped = checklistRows(items, false, true);
  assert.deepEqual(
    grouped.filter((row) => row.kind === "category").map((row) => [row.key, row.title]),
    [
      ["category:a", "Produce"],
      ["category:other", "Other groceries"],
      ["category:other-a", "Produce"],
    ],
  );
  assert.deepEqual(
    grouped.filter((row) => row.kind === "grocery").map((row) => row.item.itemId),
    ["apple", "carrot", "unknown", "pear"],
  );
  assert.deepEqual(
    checklistRows(items, false, false).map((row) => row.item.itemId),
    ["apple", "carrot", "unknown", "pear"],
  );
  assert.equal(new Set(grouped.map((row) => row.key)).size, grouped.length);
});
test("generated category grouping neither loses nor duplicates visible grocery intents and never mutates input", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          checked: fc.boolean(),
          pending: fc.boolean(),
          conflict: fc.boolean(),
          category: fc.integer({ min: 0, max: 5 }),
        }),
        { maxLength: 500 },
      ),
      fc.boolean(),
      (values, showChecked) => {
        const items = values.map((value, index) =>
          Object.freeze({
            ...value,
            itemId: String(index),
            categoryId: value.category ? String(value.category) : null,
            categoryName: value.category ? `Category ${value.category}` : null,
          }),
        );
        Object.freeze(items);
        const result = checklistRows(items, showChecked, true),
          visible = checklistItems(items, showChecked);
        assert.deepEqual(
          result
            .filter((row) => row.kind === "grocery")
            .map((row) => row.item.itemId)
            .sort(),
          visible.map((row) => row.itemId).sort(),
        );
        for (let index = 0; index < result.length; index++)
          if (result[index].kind === "category") assert.equal(result[index + 1]?.kind, "grocery");
      },
    ),
    { numRuns: 300, seed: 7420 },
  );
});
