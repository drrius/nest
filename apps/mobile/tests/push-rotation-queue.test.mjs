import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pushRotationQueue } from "../src/push/rotation-queue.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = require("effect/Effect");
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("background token events coalesce and mount does not invoke rotation", async () => {
  let active = false;
  const calls = [];
  const queue = pushRotationQueue({
    active: () => active,
    rotate: (token) =>
      Effect.sync(() => {
        calls.push(token);
        return "rotated";
      }),
  });
  await tick();
  assert.deepEqual(calls, []);
  queue.changed("first");
  queue.changed("latest");
  await tick();
  assert.deepEqual(calls, []);
  active = true;
  queue.foreground();
  await tick();
  assert.deepEqual(calls, ["latest"]);
  queue.foreground();
  await tick();
  assert.deepEqual(calls, ["latest"]);
  queue.dispose();
});
test("pending work is retried only on another event and disposal rejects later tokens", async () => {
  const calls = [];
  let pending = true;
  const queue = pushRotationQueue({
    active: () => true,
    rotate: (token) =>
      Effect.sync(() => {
        calls.push(token);
        return pending ? "pending" : "rotated";
      }),
  });
  queue.changed("token");
  await tick();
  assert.deepEqual(calls, ["token"]);
  pending = false;
  queue.foreground();
  await tick();
  assert.deepEqual(calls, ["token", "token"]);
  queue.dispose();
  queue.changed("later");
  queue.foreground();
  await tick();
  assert.equal(calls.length, 2);
});
test("going inactive during token acquisition retains the event for foreground", async () => {
  let active = true,
    count = 0;
  const queue = pushRotationQueue({
    active: () => active,
    rotate: () =>
      Effect.sync(() => {
        count++;
        active = false;
        return "inactive";
      }),
  });
  queue.changed("token");
  await tick();
  assert.equal(count, 1);
  active = true;
  queue.foreground();
  await tick();
  assert.equal(count, 2);
  queue.dispose();
});
