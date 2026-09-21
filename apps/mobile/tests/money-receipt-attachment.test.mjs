import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { ReceiptAttachmentRuntime } from "../src/money/receipt-attachment-runtime.ts";
import { receiptAttachmentOperations } from "../src/money/receipt-attachment-operations.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, account } from "./offline-fixture.mjs";
const file = () => ({
  input: {
    uploadId: "40000000-0000-4000-8000-000000000001",
    sha256: "a".repeat(64),
    bytes: 12,
    contentType: "application/pdf",
  },
  bytes: new Uint8Array(12),
});
const path = `${account.household}/receipts/40000000-0000-4000-8000-000000000001.pdf`;
const ready = (operations) => {
  const r = new ReceiptAttachmentRuntime(operations);
  r.setActive(true);
  r.setOnline(true);
  return r;
};
const deferred = () => Promise.withResolvers();
test("selection is separate from upload; duplicate taps and reconnect never write automatically", async () => {
  let writes = 0;
  const gate = deferred(),
    started = deferred();
  const r = ready({
    select: () => Effect.succeed(file()),
    upload: () =>
      Effect.promise(async () => {
        writes++;
        started.resolve();
        return gate.promise;
      }),
  });
  await r.select("pdf");
  assert.equal(writes, 0);
  assert.equal(r.getSnapshot().status, "selected");
  const uploading = r.upload();
  await started.promise;
  await r.upload();
  await r.select("photo");
  r.clearSelection();
  assert.equal(writes, 1);
  assert.equal(r.getSnapshot().status, "uncertain");
  gate.resolve({ path });
  await uploading;
  assert.equal(r.getSnapshot().path, path);
  r.setOnline(false);
  r.setOnline(true);
  await r.upload();
  assert.equal(writes, 1);
  r.setActive(false);
  assert.equal(r.getSnapshot().path, null);
  assert.equal(r.getSnapshot().contentType, null);
  r.setActive(true);
  assert.equal(r.getSnapshot().path, path);
  r.dispose();
  assert.equal(r.getSnapshot().path, null);
});
test("lost upload response preserves exact identity and bytes for explicit retry", async () => {
  const attempts = [];
  const r = ready({
    select: () => Effect.succeed(file()),
    upload: (value) => {
      attempts.push(value);
      return attempts.length === 1
        ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
        : Effect.succeed({ path });
    },
  });
  await r.select("pdf");
  await r.upload();
  assert.equal(r.getSnapshot().status, "uncertain");
  r.clearSelection();
  r.setOnline(false);
  r.setOnline(true);
  r.setActive(false);
  r.setActive(true);
  assert.equal(attempts.length, 1);
  await r.upload();
  assert.equal(attempts[0], attempts[1]);
  assert.equal(r.getSnapshot().path, path);
  r.dispose();
});
test("background interrupts upload, ignores late acknowledgment and requires explicit retry", async () => {
  const gate = deferred(),
    started = deferred();
  let writes = 0;
  const r = ready({
    select: () => Effect.succeed(file()),
    upload: () =>
      Effect.promise(async () => {
        writes++;
        started.resolve();
        return gate.promise;
      }),
  });
  await r.select("pdf");
  const upload = r.upload();
  await started.promise;
  r.setActive(false);
  await upload;
  gate.resolve({ path });
  await Promise.resolve();
  assert.equal(r.getSnapshot().path, null);
  assert.equal(r.getSnapshot().status, "uncertain");
  r.setActive(true);
  assert.equal(writes, 1);
  await r.upload();
  assert.equal(writes, 2);
  assert.equal(r.getSnapshot().path, path);
  r.dispose();
});
test("picker can finish while inactive but exposes no file metadata until screen resumes", async () => {
  const gate = deferred(),
    started = deferred();
  const r = ready({
    select: () =>
      Effect.promise(async () => {
        started.resolve();
        return gate.promise;
      }),
    upload: () => Effect.die("must not upload"),
  });
  const selection = r.select("pdf");
  await started.promise;
  r.setActive(false);
  gate.resolve(file());
  await selection;
  assert.equal(r.getSnapshot().contentType, null);
  assert.equal(r.getSnapshot().status, "selected");
  r.setActive(true);
  assert.equal(r.getSnapshot().contentType, "application/pdf");
  r.clearSelection();
  assert.equal(r.getSnapshot().status, "empty");
  r.dispose();
});
test("disposed picker cannot publish late selection and cancellation leaves no pending receipt", async () => {
  const gate = deferred(),
    started = deferred();
  const r = ready({
    select: () =>
      Effect.promise(async () => {
        started.resolve();
        return gate.promise;
      }),
    upload: () => Effect.die("must not upload"),
  });
  const selection = r.select("pdf");
  await started.promise;
  r.dispose();
  gate.resolve(file());
  await selection;
  assert.equal(r.getSnapshot().status, "empty");
  assert.equal(r.getSnapshot().contentType, null);
  const canceled = ready({
    select: () => Effect.succeed(null),
    upload: () => Effect.die("must not upload"),
  });
  await canceled.select("pdf");
  assert.equal(canceled.getSnapshot().status, "empty");
  canceled.dispose();
});
test("real SQLite lease replacement fences both late selection and late upload", async (t) => {
  for (const stage of ["selection", "upload"]) {
    const db = await fixture(t);
    const replace = () =>
      db.store.activate(
        { ...account, actor: "10000000-0000-4000-8000-000000000002" },
        "30000000-0000-4000-8000-000000000002",
      );
    let writes = 0;
    const client = {
      uploadReceipt: () =>
        Effect.gen(function* () {
          writes++;
          yield* replace();
          return { path };
        }),
    };
    const select = () =>
      stage === "selection" ? replace().pipe(Effect.as(file())) : Effect.succeed(file());
    const r = ready(
      receiptAttachmentOperations({ store: db.store, session: db.session }, client, select),
    );
    await r.select("pdf");
    if (stage === "upload") await r.upload();
    assert.equal(r.getSnapshot().verify, true);
    assert.equal(r.getSnapshot().path, null);
    assert.equal(r.getSnapshot().contentType, null);
    await r.upload();
    assert.equal(writes, stage === "upload" ? 1 : 0);
    r.dispose();
  }
});
