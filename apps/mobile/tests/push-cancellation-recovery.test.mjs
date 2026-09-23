import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { protectedPushAttempts } from "../src/push/protected-attempt.ts";
import { pushEnrollmentOperations } from "../src/push/operations.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("lost cancellation acknowledgment survives restart and retry never sends the saved enrollment", async () => {
  const values = new Map();
  const disk = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  const account = { actor: id(1), household: id(2) };
  const command = {
    action: "register",
    operationId: id(3),
    installationId: id(4),
    expectedRevision: null,
    token: "ExponentPushToken[Fixture]",
  };
  let cancelled = false,
    lose = true,
    saves = 0,
    cancellations = 0;
  const make = () => {
    const store = protectedPushAttempts(disk);
    return {
      store,
      operations: pushEnrollmentOperations({
        account,
        store,
        current: () => true,
        client: {
          recover: () =>
            Effect.succeed({ status: cancelled ? "cancelled" : "unresolved", receipt: null }),
          save: () =>
            Effect.sync(() => {
              saves++;
            }),
          cancel: () =>
            Effect.suspend(() => {
              cancellations++;
              if (lose) return Effect.fail(new PreferenceFailure({ code: "unavailable" }));
              cancelled = true;
              return Effect.succeed({ status: "cancelled", receipt: null });
            }),
        },
      }),
    };
  };
  const initial = make();
  await initial.store.stage(account, command);
  await assert.rejects(Effect.runPromise(initial.operations.cancelPending()));
  const restarted = make();
  assert.equal(await restarted.store.cancelling(account), true);
  await assert.rejects(restarted.store.stage(account, command), /cancellation pending/);
  await Effect.runPromise(restarted.operations.recover());
  assert.equal(cancellations, 1, "passive recovery must not retry cancellation");
  lose = false;
  await Effect.runPromise(restarted.operations.retryPending());
  assert.equal(cancellations, 2);
  assert.equal(saves, 0);
  assert.equal(await restarted.store.read(account), null);
});
