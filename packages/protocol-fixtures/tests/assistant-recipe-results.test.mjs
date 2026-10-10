import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("recipe results distinguish native handoff, uncertain writes and confirmed recipe revision", () => {
  const part = { type: "tool-createRecipe", state: "output-available" };
  assert.deepEqual(actionResult({ ...part, output: { ok: false, code: "native_required" } }), {
    label: "This recipe is too large for chat. Open the native recipe form; nothing was saved.",
    href: "/recipe-create",
  });
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    definitionId: id(30),
    revision: "9007199254740995",
  };
  assert.deepEqual(actionResult({ ...part, output: { ok: true, value: receipt } }), {
    label: "Recipe saved",
    href: {
      pathname: "/saved-meal",
      params: { definitionId: id(30), expectedRevision: receipt.revision },
    },
  });
  assert.equal(
    actionResult({ ...part, output: { ok: false, code: "unavailable" } }).href,
    "/meal-library",
  );
  assert.match(
    actionResult({ ...part, output: { ok: false, code: "unavailable" } }).label,
    /verify/,
  );
});

test("archive results confirm a historical action and open the library without offering another write", () => {
  const part = { type: "tool-archiveRecipe", state: "output-available" };
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    definitionId: id(30),
    revision: "9007199254740994",
  };
  assert.deepEqual(actionResult({ ...part, output: { ok: true, value: receipt } }), {
    label: "Recipe archive confirmed",
    href: "/meal-library",
  });
  for (const output of [
    { ok: false, code: "unavailable" },
    { ok: true, value: { ...receipt, revision: "0" } },
  ]) {
    const result = actionResult({ ...part, output });
    assert.match(result.label, /verify/);
    assert.equal(result.href, "/meal-library");
  }
  assert.match(actionResult({ ...part, output: { ok: false, code: "conflict" } }).label, /changed/);
});

test("selection results open retained planned details only after validated success", () => {
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(20),
    definitionId: id(30),
    entryId: id(40),
    weekStart: "2030-01-07",
    date: "2030-01-07",
    slot: "dinner",
    libraryRevision: "9",
    revision: "9007199254740995",
  };
  for (const action of ["placeRecipe", "replaceWithRecipe"]) {
    const part = { type: `tool-${action}`, state: "output-available" };
    const value =
      action === "replaceWithRecipe"
        ? { ...receipt, previousEntryId: id(41), skippedPreparationId: null }
        : receipt;
    assert.deepEqual(actionResult({ ...part, output: { ok: true, value } }).href, {
      pathname: "/planned-recipe",
      params: { entryId: id(40), weekStart: receipt.weekStart, revision: receipt.revision },
    });
    for (const output of [
      { ok: false, code: "unavailable" },
      { ok: true, value: { ...value, revision: "0" } },
    ]) {
      assert.equal(actionResult({ ...part, output }).href, "/meal-week");
      assert.match(actionResult({ ...part, output }).label, /verify/);
    }
    assert.match(
      actionResult({ ...part, output: { ok: false, code: "conflict" } }).label,
      /changed/,
    );
  }
});
