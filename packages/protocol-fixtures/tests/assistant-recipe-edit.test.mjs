import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = "00000000-0000-4000-8000-000000000200";
test("edit cards distinguish confirmed receipt, native handoff and uncertain response", () => {
  const value = {
    version: 1,
    actorId: id,
    householdId: id,
    operationId: id,
    definitionId: id,
    previousRevision: "9",
    revision: "9",
  };
  const part = { type: "tool-editRecipe", state: "output-available", output: { ok: true, value } };
  assert.deepEqual(actionResult(part), {
    label: "Recipe edit confirmed",
    href: { pathname: "/saved-meal", params: { definitionId: id, expectedRevision: "9" } },
  });
  const handoff = actionResult({ ...part, output: { ok: false, code: "native_required" } });
  assert.equal(handoff.href, "/meal-library");
  assert.match(handoff.label, /edit.*nothing was saved/);
  assert.match(
    actionResult({ ...part, output: { ok: true, value: { ...value, revision: "411" } } }).label,
    /verify/,
  );
  assert.equal(actionResult({ ...part, state: "input-available" }).href, "/meal-library");
});
