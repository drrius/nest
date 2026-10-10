import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { ReceiptAttachmentRuntime } from "../src/money/receipt-attachment-runtime.ts";
import { prepareReceiptRemoval } from "../src/money/receipt-removal.ts";
import { receiptReady } from "../src/money/receipt-draft.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const file = () => ({
  input: {
    uploadId: "00000000-0000-4000-8000-000000000100",
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  },
  bytes: new Uint8Array(128),
});
const path = "receipt-path";
async function ready(cleanup) {
  const r = new ReceiptAttachmentRuntime({
    select: () => Effect.succeed(file()),
    upload: () => Effect.succeed({ path }),
    cleanup,
  });
  r.setActive(true);
  r.setOnline(true);
  await r.select("photo");
  await r.upload();
  return r;
}
const expense = (patch = {}) => ({
  getSnapshot: () => ({
    active: true,
    online: true,
    fresh: true,
    busy: false,
    verify: false,
    attempt: null,
    result: null,
    ...patch,
  }),
});
test("explicit removal clears only confirmed deleted uploads; claimed history stays attached", async () => {
  for (const status of ["deleted", "claimed"]) {
    const r = await ready(() => Effect.succeed({ status, path }));
    await prepareReceiptRemoval(r, expense())();
    assert.equal(r.getSnapshot().status, status === "deleted" ? "empty" : "uploaded");
    assert.equal(r.getSnapshot().path, status === "deleted" ? null : path);
    if (status === "claimed") assert.match(r.getSnapshot().notice, /cannot be removed/);
    r.dispose();
  }
});
test("uncertain removal blocks Save and upload; retry reuses exact identity without reconnect writes", async () => {
  const targets = [];
  const r = await ready((input) => {
    targets.push(input);
    return targets.length === 1
      ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
      : Effect.succeed({ status: "deleted" });
  });
  await prepareReceiptRemoval(r, expense())();
  assert.equal(r.getSnapshot().status, "removal_uncertain");
  assert.equal(receiptReady(r.getSnapshot()), false);
  await r.upload();
  r.clearSelection();
  r.setOnline(false);
  r.setOnline(true);
  assert.equal(targets.length, 1);
  await prepareReceiptRemoval(r, expense())();
  assert.equal(targets[0], targets[1]);
  assert.equal(r.getSnapshot().status, "empty");
  r.dispose();
});
test("stale removal alert cannot run after Save starts or against a replacement file", async () => {
  let calls = 0,
    state = expense().getSnapshot();
  const r = await ready(() => {
    calls++;
    return Effect.succeed({ status: "deleted" });
  });
  const saving = { getSnapshot: () => state };
  const remove = prepareReceiptRemoval(r, saving);
  for (const patch of [
    { busy: true },
    { attempt: {} },
    { result: {} },
    { active: false },
    { online: false },
    { fresh: false },
    { verify: true },
  ]) {
    state = { ...expense().getSnapshot(), ...patch };
    await remove();
    assert.equal(calls, 0);
    assert.equal(prepareReceiptRemoval(r, saving), null);
  }
  state = expense().getSnapshot();
  await remove();
  assert.equal(calls, 1);
  await r.select("photo");
  await r.upload();
  await remove();
  assert.equal(calls, 1);
  r.dispose();
});
test("background removal keeps uncertain state and suppresses late acknowledgment", async () => {
  const gate = Promise.withResolvers(),
    started = Promise.withResolvers();
  const r = await ready(() =>
    Effect.promise(async () => {
      started.resolve();
      return gate.promise;
    }),
  );
  const pending = prepareReceiptRemoval(r, expense())();
  await started.promise;
  r.setActive(false);
  await pending;
  gate.resolve({ status: "deleted" });
  await Promise.resolve();
  assert.equal(r.getSnapshot().status, "removal_uncertain");
  assert.equal(r.getSnapshot().path, null);
  r.dispose();
});
