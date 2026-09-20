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
  occurrenceId: id(200),
  previousDueDate: "2026-09-20",
  dueDate: "2026-09-20",
  action: "skip",
  status: "skipped",
};
test("AI chore cards distinguish confirmed skip/reschedule from unknown, conflict and wrong action", () => {
  for (const { tool, label, value } of [
    { tool: "skipChore", label: "Chore skipped", value: receipt },
    {
      tool: "rescheduleChore",
      label: "Chore rescheduled",
      value: { ...receipt, action: "reschedule", status: "open", dueDate: "2026-09-22" },
    },
  ]) {
    const part = { type: `tool-${tool}`, state: "output-available", output: { ok: true, value } };
    assert.deepEqual(actionResult(part), { label, href: "/household" });
    assert.match(actionResult({ ...part, state: "input-available" }).label, /Reload/);
    assert.match(
      actionResult({ ...part, output: { ok: false, code: "conflict" } }).label,
      /changed/,
    );
    assert.match(
      actionResult({ ...part, output: { ok: true, value: { ...value, action: "complete" } } })
        .label,
      /Reload/,
    );
  }
});
test("AI chore schemas share the native changed-date rule and never accept model retry identity", () => {
  const input = { occurrenceId: id(200), expectedDueDate: "2026-09-20", newDueDate: "2026-09-21" };
  assert.ok(Schema.is(AssistantInputs.rescheduleChore)(input));
  assert.equal(
    Schema.is(AssistantInputs.rescheduleChore)({ ...input, newDueDate: input.expectedDueDate }),
    false,
  );
  assert.throws(() =>
    Schema.decodeUnknownSync(AssistantInputs.rescheduleChore)(
      { ...input, operationId: id(100) },
      { onExcessProperty: "error" },
    ),
  );
});
