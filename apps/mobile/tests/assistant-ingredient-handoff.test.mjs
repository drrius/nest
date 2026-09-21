import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const value = {
  kind: "device_handoff",
  screen: "meal-ingredients",
  householdId: "00000000-0000-4000-8000-000000000010",
  weekStart: "2030-01-07",
  revision: "9007199254740993",
};
const part = {
  type: "tool-openMealIngredientReview",
  state: "output-available",
  output: { ok: true, value },
};
test("ingredient handoff cards preserve exact week navigation and never claim a grocery mutation", () => {
  assert.deepEqual(actionResult(part), {
    label: "Review ingredients on your iPhone · nothing added yet",
    href: { pathname: "/meal-ingredients", params: { weekStart: "2030-01-07" } },
  });
  for (const patch of [
    { screen: "checklist" },
    { weekStart: "2030-01-08" },
    { householdId: "bad" },
    { revision: 1 },
    { added: true },
  ])
    assert.equal(
      actionResult({ ...part, output: { ok: true, value: { ...value, ...patch } } }),
      null,
    );
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
  assert.equal(actionResult({ ...part, output: { ok: false, code: "unavailable" } }), null);
});
