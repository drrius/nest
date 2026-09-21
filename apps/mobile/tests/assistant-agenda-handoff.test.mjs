import assert from "node:assert/strict";
import test from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
test("personal agenda handoff opens only the fixed local route and rejects injected private fields or destinations", () => {
  const part = {
    type: "tool-openCalendarAgenda",
    state: "output-available",
    output: { ok: true, value: { kind: "device_handoff", screen: "calendar" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Open your private agenda on your iPhone",
    href: "/agenda",
  });
  for (const output of [
    { ok: false },
    { ...part.output, href: "https://other.invalid" },
    { ok: true, value: { ...part.output.value, title: "Private event" } },
    { ok: true, value: { ...part.output.value, screen: "calendar-sharing" } },
  ])
    assert.equal(actionResult({ ...part, output }), null);
  assert.equal(actionResult({ ...part, state: "output-error" }), null);
});
