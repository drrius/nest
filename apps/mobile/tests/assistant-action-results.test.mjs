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

test("memory proposals hand off to exact native approval without claiming the memory is saved", () => {
  const value = {
    version: 1,
    actorId: id,
    householdId: id,
    approval: {
      id,
      operationId: id,
      change: { memoryId: id, expectedRevision: "0", content: "Quiet mornings" },
      status: "pending",
      expiresAt: "2026-09-20T12:00:00Z",
    },
  };
  const part = {
    type: "tool-proposeMemory",
    state: "output-available",
    output: { ok: true, value },
  };
  assert.deepEqual(actionResult(part), {
    label: "Review memory proposal",
    href: { pathname: "/memory", params: { approvalId: id } },
  });
  assert.match(actionResult({ ...part, output: { ok: true, value: {} } }).label, /verify/);
  const decode = Schema.decodeUnknownSync(AssistantInputs.proposeMemory, {
    onExcessProperty: "error",
  });
  const input = { memoryId: null, expectedRevision: "0", content: "Quiet mornings" };
  assert.deepEqual(decode(input), input);
  for (const patch of [
    { approved: true },
    { operationId: id },
    { approvalId: id },
    { actorId: id },
    { memoryId: id },
    { expectedRevision: "1" },
  ])
    assert.throws(() => decode({ ...input, ...patch }));
});

test("calendar tool handoff opens native settings without claiming consent or refresh succeeded", () => {
  const part = {
    type: "tool-openCalendarSettings",
    state: "output-available",
    output: { ok: true, value: { kind: "device_handoff", screen: "calendar-sharing" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Choose calendar access and sharing on your iPhone",
    href: "/calendar-sharing",
  });
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
  assert.equal(actionResult({ ...part, output: { ok: true, value: { enabled: true } } }), null);
  assert.equal(actionResult({ ...part, output: { ok: false, code: "forbidden" } }), null);
});

test("notification save receipt opens real private settings without claiming permission or delivery", () => {
  assert.deepEqual(
    actionResult({
      type: "tool-saveNotificationPreferences",
      state: "output-available",
      output: {
        ok: true,
        value: { actorId: id, householdId: id, operationId: id, revision: "1" },
      },
    }),
    { label: "Your notification preferences saved", href: "/notification-preferences" },
  );
});

test("setup handoff is navigation only and rejects an arbitrary destination", () => {
  const part = {
    type: "tool-openSetup",
    state: "output-available",
    output: { ok: true, value: { kind: "device_handoff", screen: "setup" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Continue your setup on your iPhone",
    href: "/setup",
  });
  assert.equal(
    actionResult({
      ...part,
      output: { ok: true, value: { kind: "device_handoff", screen: "https://evil.invalid" } },
    }),
    null,
  );
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
});

test("routine creation results require a create receipt and link to the real household list", () => {
  const value = {
    actorId: id,
    householdId: id,
    operationId: id,
    routineId: id,
    version: "2026-09-20T08:00:00.000001Z",
    action: "create",
  };
  const part = {
    type: "tool-createRoutine",
    state: "output-available",
    output: { ok: true, value },
  };
  assert.deepEqual(actionResult(part), { label: "Routine created", href: "/routines" });
  assert.match(
    actionResult({ ...part, output: { ok: true, value: { ...value, action: "edit" } } }).label,
    /verify/,
  );
  const decode = Schema.decodeUnknownSync(AssistantInputs.createRoutine, {
    onExcessProperty: "error",
  });
  const input = {
    definition: { title: "Clean", schedule: { kind: "daily" }, assignment: { policy: "shared" } },
  };
  assert.deepEqual(decode(input), input);
  assert.throws(() => decode({ ...input, operationId: id }));
});
