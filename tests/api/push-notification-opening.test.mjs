import test from "node:test";
import assert from "node:assert/strict";
import { notificationOpening } from "../../apps/mobile/src/push/notification-opening.ts";
const home = "00000000-0000-4000-8000-000000000001";
const renewal = "00000000-0000-4000-8000-000000000002";
const payload = { version: 1, kind: "renewal", householdId: home, renewalId: renewal };
const ready = { status: "ready", householdId: home, foreground: true, navigationReady: true };
function fixture() {
  const opened = [],
    consumed = [];
  return {
    opened,
    consumed,
    controller: notificationOpening({
      navigate: (id) => opened.push(id),
      consumed: (id) => consumed.push(id),
    }),
  };
}
test("cold-start response waits for account navigation and foreground, then opens once", () => {
  const f = fixture();
  f.controller.receive("tap", payload);
  f.controller.update({ ...ready, navigationReady: false });
  f.controller.update({ ...ready, foreground: false });
  assert.deepEqual(f.opened, []);
  f.controller.update(ready);
  f.controller.receive("tap", payload);
  assert.deepEqual(f.opened, [renewal]);
  assert.deepEqual(f.consumed, ["tap"]);
});
test("foreign households, logout and arbitrary routing fields cannot navigate", () => {
  const f = fixture();
  f.controller.update(ready);
  f.controller.receive("foreign", { ...payload, householdId: renewal });
  f.controller.receive("url", { ...payload, url: "https://attacker.example" });
  f.controller.receive("malformed", { ...payload, renewalId: "invalid" });
  f.controller.update({ ...ready, foreground: false });
  f.controller.receive("pending", payload);
  f.controller.update({ ...ready, status: "signed_out", householdId: null });
  f.controller.update(ready);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.consumed, ["foreign", "url", "malformed", "pending"]);
});
test("a later explicit tap replaces a queued one and opening fetches only its identity", () => {
  const f = fixture();
  f.controller.receive("first", payload);
  f.controller.receive("second", { ...payload, renewalId: home });
  f.controller.update(ready);
  assert.deepEqual(f.opened, [home]);
  assert.deepEqual(f.consumed, ["second"]);
});

test("the actual server transport payload opens only the matching household route", async () => {
  const { expoPushTransport } = await import("../../apps/api/src/push/expo-transport.ts");
  const Effect = await import("../../apps/api/node_modules/effect/dist/Effect.js");
  const f = fixture();
  f.controller.update(ready);
  let delivered;
  const transport = expoPushTransport(undefined, async (_url, input) => {
    delivered = JSON.parse(input.body).data;
    return Response.json({ data: { status: "ok", id: "ticket" } });
  });
  await Effect.runPromise(
    transport.send({ token: "ExponentPushToken[fixture]", householdId: home, renewalId: renewal }),
  );
  f.controller.receive("actual", delivered);
  assert.deepEqual(f.opened, [renewal]);
  assert.deepEqual(Object.keys(delivered).sort(), ["householdId", "kind", "renewalId", "version"]);
});
