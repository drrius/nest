import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { rotatePushDevice } from "../src/push/rotation.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
function fixture() {
  const calls = [];
  let active = true;
  const deps = {
    current: () => active,
    readInstallation: Effect.succeed("installation"),
    token: Effect.sync(() => {
      calls.push("token");
      return "rotated token";
    }),
    client: { detail: () => Effect.succeed({ enabled: true, revision: "reviewed revision" }) },
    operations: {
      recover: () => Effect.succeed(null),
      save: (command) =>
        Effect.sync(() => {
          calls.push(command);
        }),
    },
    operationId: () => "operation",
  };
  return {
    deps,
    calls,
    stop: () => {
      active = false;
    },
  };
}
test("rotation retains the enabled baseline observed before token acquisition", async () => {
  const f = fixture();
  f.deps.token = Effect.sync(() => {
    f.deps.client.detail = () => Effect.succeed({ enabled: false, revision: "newer disable" });
    return "rotated token";
  });
  assert.equal(await Effect.runPromise(rotatePushDevice(f.deps)), "rotated");
  assert.equal(f.calls[0].expectedRevision, "reviewed revision");
  assert.equal(f.calls[0].token, "rotated token");
});
test("disabled and missing installations never acquire a token or stage enrollment", async () => {
  const f = fixture();
  f.deps.client.detail = () => Effect.succeed({ enabled: false, revision: "revision" });
  assert.equal(await Effect.runPromise(rotatePushDevice(f.deps)), "inactive");
  assert.deepEqual(f.calls, []);
  const g = fixture();
  g.deps.readInstallation = Effect.succeed(null);
  assert.equal(await Effect.runPromise(rotatePushDevice(g.deps)), "inactive");
  assert.deepEqual(g.calls, []);
});
test("account replacement during token acquisition prevents staging", async () => {
  const f = fixture();
  f.deps.token = Effect.sync(() => {
    f.stop();
    return "token";
  });
  assert.equal(await Effect.runPromise(rotatePushDevice(f.deps)), "inactive");
  assert.deepEqual(f.calls, []);
});
