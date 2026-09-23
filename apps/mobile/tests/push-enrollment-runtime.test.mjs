import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pushEnrollmentOwner } from "../src/push/enrollment-owner.ts";
import { PushEnrollmentRuntime } from "../src/push/enrollment-runtime.ts";
import { pushPermission, allowsPush } from "../src/push/permission.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
function fixture() {
  const writes = [];
  let pending = null;
  const deps = {
    onCancelled: () => Effect.void,
    onRecorded: () => Effect.void,
    account: { actor: "actor", household: "home" },
    store: {
      cancelling: async () => false,
      read: async () => pending,
      stage: async (commandAccount, command) => {
        pending = command;
        return command;
      },
      clear: async () => {
        pending = null;
      },
    },
    client: {
      /** @returns {import("effect/Effect").Effect<{ enabled: boolean, revision: string }, PreferenceFailure>} */
      detail: () => Effect.succeed({ enabled: true, revision: "revision" }),
      recover: () => Effect.succeed({ status: "unresolved" }),
      save: (command) =>
        Effect.sync(() => {
          writes.push(command);
          return {};
        }),
    },
    installation: Effect.sync(() => {
      writes.push("create installation");
      return "installation";
    }),
    readInstallation: Effect.succeed("installation"),
    permission: Effect.succeed({ status: "quiet", canAskAgain: true }),
    token: Effect.sync(() => {
      writes.push("prompt/token");
      return "token";
    }),
    operationId: () => "operation",
  };
  return {
    deps,
    writes,
    pending: (value) => {
      pending = value;
    },
  };
}
test("opening enrollment reads registration without prompting, creating an installation or writing", async () => {
  const f = fixture();
  const runtime = new PushEnrollmentRuntime(f.deps);
  await runtime.load();
  assert.equal(runtime.getSnapshot().enabled, true);
  assert.equal(runtime.getSnapshot().permission.status, "quiet");
  assert.deepEqual(f.writes, []);
  runtime.dispose();
});
test("unresolved enrollment blocks new intent and retries the retained command only", async () => {
  const f = fixture();
  const command = { action: "register", operationId: "original", token: "original token" };
  f.pending(command);
  const runtime = new PushEnrollmentRuntime(f.deps);
  await runtime.load();
  assert.equal(runtime.getSnapshot().pending, true);
  await runtime.enable();
  await runtime.disable();
  assert.deepEqual(f.writes, []);
  await runtime.retry();
  assert.deepEqual(f.writes, [command]);
  assert.equal(runtime.getSnapshot().pending, false);
  runtime.dispose();
});
test("failed registration reads cannot enable actions or preserve a previous enabled claim", async () => {
  const f = fixture();
  const runtime = new PushEnrollmentRuntime(f.deps);
  await runtime.load();
  f.deps.client.detail = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));
  await runtime.load();
  assert.equal(runtime.getSnapshot().loaded, false);
  assert.equal(runtime.getSnapshot().enabled, null);
  await runtime.enable();
  assert.deepEqual(f.writes, []);
  runtime.dispose();
  await runtime.load();
  assert.equal(runtime.getSnapshot().loaded, false);
});
test("iOS permission distinguishes quiet and temporary grants and fails closed for unknown states", () => {
  const statuses = ["undetermined", "denied", "allowed", "quiet", "temporary", "unknown"];
  for (const [status, expected] of statuses.entries()) {
    const permission = pushPermission({ granted: true, canAskAgain: false, ios: { status } });
    assert.equal(permission.status, expected);
    assert.equal(allowsPush(permission), status >= 2 && status <= 4);
  }
});

test("subscription restart replaces the disposed controller without prompting or sending writes", async () => {
  const f = fixture();
  const owner = pushEnrollmentOwner(f.deps);
  assert.equal(owner.getSnapshot(), null);
  const unsubscribe = owner.subscribe(() => {});
  const first = owner.getSnapshot();
  unsubscribe();
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {});
  const second = owner.getSnapshot();
  assert.notEqual(first, second);
  await first.enable();
  await first.retry();
  assert.equal(first.getSnapshot().loaded, false);
  assert.deepEqual(f.writes, []);
  stop();
});
test("pending cancellation is presented as cancellation and never as a new enrollment", async () => {
  const f = fixture();
  f.pending({ operationId: "original" });
  f.deps.store.cancelling = async () => true;
  const runtime = new PushEnrollmentRuntime(f.deps);
  await runtime.load();
  assert.equal(runtime.getSnapshot().cancelling, true);
  assert.match(runtime.getSnapshot().notice, /Retry cancellation/);
  await runtime.enable();
  assert.deepEqual(f.writes, []);
  runtime.dispose();
});
