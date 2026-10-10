import assert from "node:assert/strict";
import test from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const value = { version: 1, householdId: id(10), actorId: id(1), approvals: [], next: null };
const part = {
  type: "tool-listPendingFinancialApprovals",
  state: "output-available",
  output: { ok: true, value },
};
test("approval read handoff reloads current private Today state without deciding or forwarding cached identities", () => {
  assert.deepEqual(actionResult(part), {
    label: "Open Today to review your current private approvals",
    href: "/household",
  });
  for (const input of [
    { ...part, state: "input-available" },
    { ...part, output: { ok: false, code: "forbidden" } },
    { ...part, output: { ok: true, value: { ...value, payload: { secret: true } } } },
    {
      ...part,
      output: {
        ok: true,
        value: {
          ...value,
          approvals: [
            {
              approvalId: id(100),
              command: "memory.save",
              expiresAt: "2026-09-23T12:00:00.000000Z",
            },
          ],
        },
      },
    },
  ])
    assert.equal(actionResult(input), null);
});
