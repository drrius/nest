import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("preparation receipt opens current task and malformed or uncertain output cannot claim success", () => {
  const part = { type: "tool-editMealPreparation", state: "output-available" };
  const value = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    entryId: id(30),
    weekStart: "2030-01-07",
    revision: "1",
    routineId: id(40),
    occurrenceId: id(41),
    previousRoutineVersion: "2030-01-07T12:00:00.123455Z",
    routineVersion: "2030-01-07T12:00:00.123456Z",
    dueOn: "2030-01-06",
  };
  assert.deepEqual(actionResult({ ...part, output: { ok: true, value } }), {
    label: "Meal preparation edit confirmed",
    href: {
      pathname: "/meal-preparation",
      params: { entryId: id(30), weekStart: value.weekStart },
    },
  });
  for (const output of [
    { ok: false, code: "unavailable" },
    { ok: true, value: { ...value, routineId: "wrong" } },
  ]) {
    assert.equal(actionResult({ ...part, output }).href, "/meal-week");
    assert.match(actionResult({ ...part, output }).label, /verify/);
  }
});
