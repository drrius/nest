import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
import { requestedMealWeek } from "../src/meals/route-week.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  entryId: id(30),
  weekStart: "2026-10-05",
  date: "2026-10-06",
  slot: "lunch",
  revision: "1",
};
test("confirmed placement opens its exact saved week; uncertain and malformed outputs do not claim success", () => {
  const part = {
    type: "tool-placeMeal",
    state: "output-available",
    output: { ok: true, value: receipt },
  };
  assert.deepEqual(actionResult(part), {
    label: "Meal added to the week",
    href: { pathname: "/meal-week", params: { weekStart: "2026-10-05" } },
  });
  assert.equal(
    actionResult({ ...part, state: "input-available" }).label,
    "Reload saved conversation to verify this action.",
  );
  assert.equal(
    actionResult({ ...part, output: { ok: true, value: { ...receipt, date: "2026-10-12" } } })
      .label,
    "Reload saved conversation to verify this action.",
  );
  assert.equal(
    actionResult({ ...part, output: { ok: false, code: "conflict" } }).label,
    "This item changed. Review its current state before trying again.",
  );
});
test("week links accept complete Monday weeks and safely fall back for malformed route params", () => {
  assert.equal(requestedMealWeek("2026-10-05", "2026-09-22"), "2026-10-05");
  for (const value of [undefined, ["2026-10-05"], "2026-10-06", "9999-12-27", "2026-02-30"])
    assert.equal(requestedMealWeek(value, "2026-09-22"), "2026-09-21");
});
