import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("leftovers result links to new retained details and uncertainty never claims success", () => {
  const part = { type: "tool-placeLeftovers", state: "output-available" };
  const value = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    sourceEntryId: id(30),
    entryId: id(40),
    sourceWeekStart: "2030-01-07",
    targetWeekStart: "2030-01-14",
    date: "2030-01-15",
    slot: "dinner",
    sourceRevision: "9007199254740993",
    targetRevision: "1",
  };
  assert.deepEqual(actionResult({ ...part, output: { ok: true, value } }), {
    label: "Leftovers added to the week",
    href: {
      pathname: "/planned-recipe",
      params: { entryId: id(40), weekStart: "2030-01-14", revision: "1" },
    },
  });
  for (const output of [
    { ok: false, code: "unavailable" },
    { ok: true, value: { ...value, entryId: id(30) } },
  ]) {
    assert.equal(actionResult({ ...part, output }).href, "/meal-week");
    assert.match(actionResult({ ...part, output }).label, /verify/);
  }
});
