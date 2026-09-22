import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pushEnrollmentActions } from "../src/push/enrollment-actions.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
function setup() {
  const calls = [];
  let active = true,
    unresolved = false;
  const deps = {
    current: () => active,
    installation: Effect.sync(() => {
      calls.push("installation");
      return "installation";
    }),
    token: Effect.sync(() => {
      calls.push("permission/token");
      return "token";
    }),
    operationId: () => "operation",
    client: {
      detail: () =>
        Effect.sync(() => {
          calls.push("current revision");
          return { revision: "fresh" };
        }),
    },
    operations: {
      recover: () =>
        Effect.sync(() => {
          calls.push("recover");
          return unresolved ? { status: "unresolved" } : null;
        }),
      save: (command) =>
        Effect.sync(() => {
          calls.push(command);
          return command;
        }),
    },
  };
  return {
    deps,
    calls,
    stop: () => {
      active = false;
    },
    pending: () => {
      unresolved = true;
    },
  };
}
test("explicit enable reads the current revision after permission; disable never requests permission", async () => {
  const f = setup(),
    actions = pushEnrollmentActions(f.deps);
  assert.deepEqual(f.calls, []);
  const saved = await Effect.runPromise(actions.enable());
  assert.deepEqual(f.calls.slice(0, 4), [
    "recover",
    "installation",
    "permission/token",
    "current revision",
  ]);
  assert.equal(saved.expectedRevision, "fresh");
  f.calls.length = 0;
  const disabled = await Effect.runPromise(actions.disable());
  assert.equal(disabled.action, "disable");
  assert.equal(f.calls.includes("permission/token"), false);
});
test("unresolved intent and account changes prevent permission or mutation", async () => {
  const f = setup();
  f.pending();
  await assert.rejects(Effect.runPromise(pushEnrollmentActions(f.deps).enable()));
  assert.deepEqual(f.calls, ["recover"]);
  const g = setup();
  g.deps.token = Effect.sync(() => {
    g.stop();
    return "token";
  });
  await assert.rejects(Effect.runPromise(pushEnrollmentActions(g.deps).enable()));
  assert.deepEqual(g.calls, ["recover", "installation"]);
});
