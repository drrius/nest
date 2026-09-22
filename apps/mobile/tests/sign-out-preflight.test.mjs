import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { signOutSession } from "../src/session/sign-out.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
function fixture() {
  const calls = [];
  const auth = {
    stopAutoRefresh: async () => {
      calls.push("stop refresh");
    },
    admin: {
      signOut: async () => {
        calls.push("revoke session");
      },
    },
    signOut: async () => {
      calls.push("remove session");
    },
    getSession: async () => ({ data: { session: null }, error: null }),
  };
  const subscription = {
    hide: () => {
      calls.push("hide");
    },
    finishSignOut: () => {
      calls.push("finished");
    },
  };
  const begin = async () => {
    calls.push("hide persisted credentials");
    return "fixture token";
  };
  return { calls, auth, subscription, begin };
}
test("required device cleanup runs after hiding UI and before credential removal", async () => {
  const f = fixture();
  await Effect.runPromise(
    signOutSession(f.auth, f.subscription, f.begin, async () => {
      f.calls.push("disable device");
    }),
  );
  assert.deepEqual(f.calls, [
    "hide",
    "hide persisted credentials",
    "disable device",
    "stop refresh",
    "revoke session",
    "remove session",
    "finished",
  ]);
});
test("failed device cleanup retains credentials and permits explicit sign-out retry", async () => {
  const f = fixture();
  await assert.rejects(
    Effect.runPromise(
      signOutSession(f.auth, f.subscription, f.begin, async () => {
        throw new Error("network unavailable");
      }),
    ),
  );
  assert.deepEqual(f.calls, ["hide", "hide persisted credentials"]);
  await Effect.runPromise(
    signOutSession(f.auth, f.subscription, f.begin, async () => {
      f.calls.push("disable device");
    }),
  );
  assert.equal(f.calls.at(-1), "finished");
  assert.equal(f.calls.filter((call) => call === "remove session").length, 1);
});
