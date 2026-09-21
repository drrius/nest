import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { ReceiptRecoveryRuntime } from "../src/money/receipt-recovery-runtime.ts";
import { receiptRecoveryOperations } from "../src/money/receipt-recovery-operations.ts";
import { receiptRecoveryOwner } from "../src/money/receipt-recovery-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, account, run } from "./offline-fixture.mjs";
import { attempt } from "./money-save-fixture.mjs";
const row = {
  uploadId: "40000000-0000-4000-8000-000000000001",
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
  path: "path",
  status: "pending",
  stored: true,
  createdAt: "2026-09-21T10:00:00.000000Z",
};
const page = (after = null, next = null) => ({
  version: 1,
  householdId: account.household,
  uploaderId: account.actor,
  after,
  next,
  uploads: [{ ...row }],
});
const open = async (r) => {
  await r.setOnline(true);
  await r.setActive(true);
  return r;
};
test("recovery reads on foreground/reconnect, paginates and never removes automatically", async () => {
  const cursors = [];
  let writes = 0;
  const r = await open(
    new ReceiptRecoveryRuntime({
      read: (after) => {
        cursors.push(after);
        return Effect.succeed(page(after, after ? null : row.uploadId));
      },
      remove: () => {
        writes++;
        return Effect.succeed({ status: "deleted" });
      },
    }),
  );
  await r.next();
  assert.deepEqual(cursors, [null, row.uploadId]);
  await r.setActive(false);
  assert.equal(r.getSnapshot().page, null);
  await r.setActive(true);
  await r.setOnline(false);
  assert.equal(r.getSnapshot().page, null);
  await r.setOnline(true);
  assert.equal(writes, 0);
  r.dispose();
});
test("old alert after reload cannot delete; current claimed receipt reports retained history", async () => {
  let writes = 0;
  const r = await open(
    new ReceiptRecoveryRuntime({
      read: () => Effect.succeed(page()),
      remove: () => {
        writes++;
        return Effect.succeed({ status: "claimed" });
      },
    }),
  );
  const old = r.getSnapshot().page.uploads[0];
  await r.refresh();
  await r.remove(old);
  assert.equal(writes, 0);
  await r.remove(r.getSnapshot().page.uploads[0]);
  assert.equal(writes, 1);
  assert.equal(r.getSnapshot().page.uploads.length, 0);
  assert.match(r.getSnapshot().notice, /retained/);
  r.dispose();
});
test("uncertain cleanup requires fresh read before another explicit removal", async () => {
  let writes = 0;
  const r = await open(
    new ReceiptRecoveryRuntime({
      read: () => Effect.succeed(page()),
      remove: () => {
        writes++;
        return Effect.fail(new PreferenceFailure({ code: "unavailable" }));
      },
    }),
  );
  const selected = r.getSnapshot().page.uploads[0];
  await r.remove(selected);
  assert.equal(r.getSnapshot().page, null);
  await r.remove(selected);
  await r.setOnline(false);
  await r.setOnline(true);
  assert.equal(writes, 1);
  await r.remove(r.getSnapshot().page.uploads[0]);
  assert.equal(writes, 2);
  r.dispose();
});
test("background and disposal suppress late cleanup acknowledgments", async () => {
  const gate = Promise.withResolvers(),
    started = Promise.withResolvers();
  const r = await open(
    new ReceiptRecoveryRuntime({
      read: () => Effect.succeed(page()),
      remove: () =>
        Effect.promise(async () => {
          started.resolve();
          return gate.promise;
        }),
    }),
  );
  const removal = r.remove(r.getSnapshot().page.uploads[0]);
  await started.promise;
  await r.setActive(false);
  await removal;
  gate.resolve({ status: "deleted" });
  await Promise.resolve();
  assert.equal(r.getSnapshot().page, null);
  assert.equal(r.getSnapshot().notice, null);
  r.dispose();
});
test("real SQLite pending Save blocks cleanup and replaced lease hides delayed recovery results", async (t) => {
  const db = await fixture(t);
  let writes = 0;
  const client = {
    receiptUploads: () => Effect.succeed(page()),
    cleanupReceipt: () => {
      writes++;
      return Effect.succeed({ status: "deleted" });
    },
  };
  const accountValue = { store: db.store, session: db.session };
  const r = await open(new ReceiptRecoveryRuntime(receiptRecoveryOperations(accountValue, client)));
  await run(db.store.stageExpenseSave(db.session, attempt, () => true));
  await r.remove(r.getSnapshot().page.uploads[0]);
  assert.equal(writes, 0);
  assert.match(r.getSnapshot().notice, /pending expense Save/);
  r.dispose();
  const replaced = {
    ...client,
    receiptUploads: () =>
      db.store
        .activate(
          { ...account, actor: "10000000-0000-4000-8000-000000000002" },
          "30000000-0000-4000-8000-000000000002",
        )
        .pipe(Effect.as(page())),
  };
  const revoked = await open(
    new ReceiptRecoveryRuntime(receiptRecoveryOperations(accountValue, replaced)),
  );
  assert.equal(revoked.getSnapshot().verify, true);
  assert.equal(revoked.getSnapshot().page, null);
  revoked.dispose();
});
test("last owner unsubscribe discards data and a later mount starts fresh", async () => {
  const owner = receiptRecoveryOwner({
    read: () => Effect.succeed(page()),
    remove: () => Effect.die("must not remove"),
  });
  const release = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await open(first);
  release();
  assert.equal(owner.getSnapshot(), null);
  assert.equal(first.getSnapshot().page, null);
  const next = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  assert.equal(owner.getSnapshot().getSnapshot().page, null);
  next();
});
