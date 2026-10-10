import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { syncOfflineFlow } from "../src/offline/sync.ts";
import { connectivityHub } from "../src/offline/connectivity-hub.ts";

test("a reconnect queued during a failing request gets one follow-up cycle", async () => {
  let fail,
    calls = 0;
  const patches = [];
  const refresh = syncOfflineFlow(
    { sync: Effect.void },
    {
      run: async () => {
        calls++;
        if (calls === 1)
          await new Promise((_, reject) => {
            fail = reject;
          });
        return null;
      },
      read: async () => {},
      emit: (patch) => patches.push(patch),
      disposed: () => false,
    },
  );
  const first = refresh();
  await Promise.resolve();
  const reconnected = refresh();
  assert.equal(first, reconnected);
  fail({ code: "unavailable" });
  await reconnected;
  assert.equal(calls, 2);
  assert.equal(patches.at(-1).syncing, false);
  assert.ok(patches.some((patch) => patch.stale === false));
});

test("failure without another trigger does not loop or clear known access denial", async () => {
  let calls = 0;
  const view = { access: "verify" };
  const refresh = syncOfflineFlow(
    { sync: Effect.void },
    {
      run: async () => {
        calls++;
        throw { code: "unavailable" };
      },
      read: async () => {},
      emit: (patch) => Object.assign(view, patch),
      disposed: () => false,
    },
  );
  await refresh();
  assert.equal(calls, 1);
  assert.equal(view.access, "verify");
  assert.equal(view.stale, true);
});

test("account replacement keeps one native monitor and drops old account callbacks", () => {
  let emit,
    starts = 0,
    cancels = 0;
  const subscribe = connectivityHub((listener) => {
    starts++;
    emit = listener;
    return {
      remove: () => {
        cancels++;
      },
    };
  });
  const first = [],
    second = [];
  const previous = subscribe((state) => first.push(state));
  emit({ isConnected: false });
  previous.remove();
  emit({ isConnected: true });
  const current = subscribe((state) => second.push(state));
  emit({ isConnected: true });
  assert.deepEqual(first, [{ isConnected: false }]);
  assert.deepEqual(second, [{ isConnected: true }]);
  current.remove();
  assert.equal(starts, 1);
  assert.equal(cancels, 0);
});

test("failed native registration can retry without retaining the old subscriber", () => {
  let starts = 0,
    emit;
  const subscribe = connectivityHub((listener) => {
    if (++starts === 1) throw new Error("unavailable");
    emit = listener;
    return { remove() {} };
  });
  assert.throws(() => subscribe(() => assert.fail("old subscriber retained")));
  let calls = 0;
  subscribe(() => calls++);
  emit({ isConnected: true });
  assert.equal(calls, 1);
});
