import assert from "node:assert/strict";
import { test } from "node:test";
import * as Schema from "effect/Schema";
import { AssistantInputs } from "@nest/contracts/assistant-actions";
import { actionResult } from "../src/assistant/action-result.ts";
const id = "00000000-0000-4000-8000-000000000100";
const check = {
  type: "tool-checkGrocery",
  state: "output-available",
  output: {
    ok: true,
    value: { operation: id, target: id, version: "2", checked: false, outcome: "applied" },
  },
};

test("receipt cards distinguish confirmed unchecked state, conflict and unknown outcome", () => {
  assert.equal(actionResult(check).label, "Grocery unchecked");
  assert.equal(actionResult(check).href, "/checklist");
  assert.match(
    actionResult({ ...check, output: { ok: false, code: "conflict" } }).label,
    /changed/,
  );
  assert.match(
    actionResult({ ...check, output: { ok: false, code: "unavailable" } }).label,
    /verify/,
  );
  assert.match(actionResult({ ...check, state: "input-available" }).label, /verify/);
  assert.match(actionResult({ ...check, output: { ok: true, value: {} } }).label, /verify/);
  assert.equal(actionResult({ type: "tool-transferMoney", output: { ok: true } }), null);
});

test("model command schemas reuse native fields without exposing generated retry identities", () => {
  const decode = Schema.decodeUnknownSync(AssistantInputs.addGrocery, {
    onExcessProperty: "error",
  });
  const input = { name: "Apples", quantity: null, unit: null, categoryId: null };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, operationId: id }));
  assert.throws(() => decode({ ...input, itemId: id }));
  assert.throws(() => decode({ ...input, name: " " }));
  assert.throws(() =>
    Schema.decodeUnknownSync(AssistantInputs.checkGrocery)({
      itemId: id,
      expectedVersion: "9223372036854775808",
      checked: true,
    }),
  );
});

test("food preference receipts link to private settings and require a valid save result", () => {
  const part = {
    type: "tool-saveFoodPreferences",
    state: "output-available",
    output: { ok: true, value: { actorId: id, householdId: id, operationId: id, revision: "1" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Your food preferences saved",
    href: "/food-preferences",
  });
  assert.match(actionResult({ ...part, output: { ok: true, value: {} } }).label, /verify/);
  const decode = Schema.decodeUnknownSync(AssistantInputs.saveFoodPreferences, {
    onExcessProperty: "error",
  });
  const input = {
    expectedRevision: "0",
    preferences: { restrictions: [], dislikes: [], calorieGoal: null, portions: 1 },
  };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, actorId: id }));
  assert.throws(() => decode({ ...input, operationId: id }));
});

test("cooking preference receipts link to shared settings and require a valid save result", () => {
  const part = {
    type: "tool-saveCookingPreferences",
    state: "output-available",
    output: { ok: true, value: { actorId: id, householdId: id, operationId: id, revision: "1" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Household cooking preferences saved",
    href: "/cooking-preferences",
  });
  assert.match(actionResult({ ...part, output: { ok: true, value: {} } }).label, /verify/);
  const decode = Schema.decodeUnknownSync(AssistantInputs.saveCookingPreferences, {
    onExcessProperty: "error",
  });
  const input = {
    expectedRevision: "0",
    preferences: { cookingNotes: "", mealSlots: ["dinner"] },
  };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, actorId: id }));
  assert.throws(() => decode({ ...input, operationId: id }));
});
