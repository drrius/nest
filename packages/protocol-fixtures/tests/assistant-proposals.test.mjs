import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
import { receipt, ready, weekStart } from "./meal-proposal-fixture.mjs";
const part = (name, value) => ({
  type: `tool-${name}`,
  state: "output-available",
  output: { ok: true, value },
});
test("proposal reservation cards link the original private preview without claiming readiness or approval", () => {
  const result = actionResult(part("generateMealProposal", receipt));
  assert.match(result.label, /requested/);
  assert.deepEqual(result.href, {
    pathname: "/meal-proposal",
    params: { proposalId: receipt.proposalId, weekStart },
  });
  const opened = actionResult(part("readMealProposal", { version: 1, receipt, envelope: ready }));
  assert.deepEqual(opened.href, result.href);
  assert.match(opened.label, /approval is on your iPhone/);
  assert.equal(actionResult(part("approveMealProposal", receipt)), null);
});
test("unconfirmed or mismatched proposal reads cannot produce an actionable preview card", () => {
  assert.equal(actionResult({ type: "tool-readMealProposal", state: "input-available" }), null);
  const malformed = {
    version: 1,
    receipt: { ...receipt, weekStart: "2030-01-14" },
    envelope: ready,
  };
  assert.equal(actionResult(part("readMealProposal", malformed)), null);
  const uncertain = actionResult({
    type: "tool-generateMealProposal",
    state: "output-available",
    output: { ok: false, code: "unavailable" },
  });
  assert.match(uncertain.label, /verify/);
  assert.equal(uncertain.href, "/meal-week");
});
