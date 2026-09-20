import assert from "node:assert/strict";
import { test } from "node:test";
import * as Schema from "effect/Schema";
import { AssistantInputs } from "@nest/contracts/assistant-actions";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  requestId: id(200),
  occurrenceId: id(300),
  dueDate: "2026-09-20",
  fromMemberId: id(1),
  toMemberId: id(2),
  action: "request",
  state: "pending",
};
test("native AI handover cards distinguish pending consent, acceptance and decline from uncertain results", () => {
  for (const [action, state, label] of [
    ["request", "pending", "Handover requested"],
    ["accept", "accepted", "Handover accepted"],
    ["decline", "declined", "Handover declined"],
  ]) {
    const value = { ...receipt, action, state, actorId: action === "request" ? id(1) : id(2) };
    const part = {
      type: action === "request" ? "tool-requestChoreTransfer" : "tool-respondChoreTransfer",
      state: "output-available",
      output: { ok: true, value },
    };
    assert.deepEqual(actionResult(part), { label, href: "/chore-transfers" });
    assert.match(actionResult({ ...part, state: "input-available" }).label, /Reload/);
    assert.match(
      actionResult({ ...part, output: { ok: false, code: "conflict" } }).label,
      /changed/,
    );
    assert.match(
      actionResult({ ...part, output: { ok: true, value: { ...value, state: "invented" } } }).label,
      /Reload/,
    );
  }
  assert.match(
    actionResult({
      type: "tool-respondChoreTransfer",
      state: "output-available",
      output: { ok: true, value: receipt },
    }).label,
    /Reload/,
  );
});
test("assistant handovers reuse strict native target and response fields without retry or scope identities", () => {
  for (const [schema, input] of [
    [
      AssistantInputs.requestChoreTransfer,
      { occurrenceId: id(300), expectedDueDate: "2026-09-20", recipientId: id(2) },
    ],
    [AssistantInputs.respondChoreTransfer, { requestId: id(200), action: "accept" }],
  ]) {
    assert.deepEqual(Schema.decodeUnknownSync(schema)(input), input);
    for (const patch of [{ actorId: id(1) }, { householdId: id(10) }, { operationId: id(100) }])
      assert.throws(() =>
        Schema.decodeUnknownSync(schema)({ ...input, ...patch }, { onExcessProperty: "error" }),
      );
  }
  assert.equal(
    Schema.is(AssistantInputs.respondChoreTransfer)({ requestId: id(200), action: "request" }),
    false,
  );
});
