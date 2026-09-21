import test from "node:test";
import assert from "node:assert/strict";
import { variableLeavePolicy } from "../src/money/variable-leave-policy.ts";
const draft = { amount: "", split: "equal", firstExact: "", secondExact: "", firstPercent: "50" };
const view = { busy: false, attempt: null, result: null };
test("leaving a variable bill warns for changed native fields and unresolved posting", () => {
  assert.equal(variableLeavePolicy(draft, view), "quiet");
  for (const edit of [
    { amount: "10" },
    { split: "exact" },
    { firstExact: "1" },
    { secondExact: "1" },
    { firstPercent: "0" },
  ])
    assert.equal(variableLeavePolicy({ ...draft, ...edit }, view), "draft");
  assert.equal(variableLeavePolicy(draft, { ...view, busy: true }), "pending");
  for (const action of ["save", "cancel"])
    assert.equal(variableLeavePolicy(draft, { ...view, attempt: { action } }), "pending");
  for (const status of ["recorded", "cancelled"]) {
    assert.equal(
      variableLeavePolicy({ ...draft, amount: "1" }, { ...view, result: { status } }),
      "quiet",
    );
    assert.equal(
      variableLeavePolicy(draft, { ...view, attempt: { action: "save" }, result: { status } }),
      "pending",
    );
  }
});
