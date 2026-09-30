import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  entryId: id(30),
  sourceWeekStart: "2026-10-05",
  targetWeekStart: "2026-10-12",
  date: "2026-10-13",
  slot: "dinner",
  sourceRevision: "1",
  targetRevision: "1",
};
test("confirmed movement opens its exact destination week; uncertain and malformed outputs do not claim success", () => {
  const part = {
    type: "tool-moveMeal",
    state: "output-available",
    output: { ok: true, value: receipt },
  };
  assert.deepEqual(actionResult(part), {
    label: "Meal moved",
    href: { pathname: "/meal-week", params: { weekStart: "2026-10-12" } },
  });
  assert.equal(
    actionResult({ ...part, state: "input-available" }).label,
    "Reload saved conversation to verify this action.",
  );
  assert.equal(
    actionResult({ ...part, output: { ok: true, value: { ...receipt, targetRevision: "0" } } })
      .label,
    "Reload saved conversation to verify this action.",
  );
  assert.equal(
    actionResult({ ...part, output: { ok: false, code: "conflict" } }).label,
    "This item changed. Review its current state before trying again.",
  );
});
