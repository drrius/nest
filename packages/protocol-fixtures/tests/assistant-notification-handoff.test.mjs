import assert from "node:assert/strict";
import test from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";

test("notification handoff only opens its fixed native destination after a successful tool result", () => {
  const part = {
    type: "tool-openNotificationSetup",
    state: "output-available",
    output: { ok: true, value: { kind: "device_handoff", screen: "notification-preferences" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Review notification permission and devices on your iPhone",
    href: "/notification-preferences",
  });
  for (const output of [
    { ok: false, code: "forbidden" },
    { ok: true, value: { kind: "device_handoff", screen: "https://evil.invalid" } },
    { ok: true, value: { kind: "device_handoff", screen: "setup" } },
    { ok: true, value: { kind: "enabled", screen: "notification-preferences" } },
    null,
  ])
    assert.equal(actionResult({ ...part, output }), null);
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
});

test("account handoff requires successful output and cannot select another destination", () => {
  const part = {
    type: "tool-openAccountSettings",
    state: "output-available",
    output: { ok: true, value: { kind: "device_handoff", screen: "settings" } },
  };
  assert.deepEqual(actionResult(part), {
    label: "Review your account or sign out on your iPhone",
    href: "/settings",
  });
  for (const output of [
    null,
    { ok: false, code: "forbidden" },
    { ok: true, value: { kind: "device_handoff", screen: "notification-preferences" } },
    { ok: true, value: { kind: "signed_out", screen: "settings" } },
  ])
    assert.equal(actionResult({ ...part, output }), null);
  assert.equal(actionResult({ ...part, state: "input-available" }), null);
});
