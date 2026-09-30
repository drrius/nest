import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  metadata,
  link,
  target,
  Effect,
  run,
  account,
} from "./money-receipt-view-fixture.mjs";
import { ReceiptViewRuntime } from "../src/money/receipt-view-runtime.ts";
import { receiptViewOperations } from "../src/money/receipt-view-operations.ts";
import { receiptViewOwner } from "../src/money/receipt-view-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const unavailable = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));
const ready = async (runtime) => {
  await runtime.setOnline(true);
  await runtime.setActive(true);
};
test("receipt image requires online metadata and link; load errors and stale image callbacks cannot report success", async (t) => {
  const f = await fixture(t),
    r = f.runtime;
  await r.setActive(true);
  assert.equal(r.getSnapshot().metadata, null);
  await r.setOnline(true);
  const first = r.getSnapshot().link;
  assert.equal(r.getSnapshot().image, "loading");
  assert.equal(f.counts().opens, 0);
  r.imageReady(first);
  assert.equal(r.getSnapshot().image, "ready");
  r.imageFailed(first);
  assert.equal(r.getSnapshot().link, null);
  assert.equal(r.getSnapshot().image, "failed");
  await r.refresh();
  const second = r.getSnapshot().link;
  r.imageReady(first);
  assert.equal(r.getSnapshot().image, "loading");
  r.imageReady(second);
  assert.equal(r.getSnapshot().image, "ready");
  await r.setOnline(false);
  assert.equal(r.getSnapshot().link, null);
  assert.equal(r.getSnapshot().metadata, null);
});
test("no receipt does not sign a link and failure is not misreported as an empty attachment", async (t) => {
  const f = await fixture(t);
  f.value({ ...metadata, receipt: null });
  await ready(f.runtime);
  assert.equal(f.runtime.getSnapshot().metadata.receipt, null);
  assert.equal(f.counts().links, 0);
  const broken = new ReceiptViewRuntime({ ...f.operations, read: unavailable }, target);
  await ready(broken);
  assert.equal(broken.getSnapshot().metadata, null);
  assert.match(broken.getSnapshot().notice, /Could not/);
  broken.dispose();
});
test("PDF remains a manual browser handoff, duplicate taps cannot reopen and background closes it", async (t) => {
  const f = await fixture(t);
  f.value({
    ...metadata,
    receipt: {
      ...metadata.receipt,
      contentType: "application/pdf",
      path: metadata.receipt.path.replace(".jpg", ".pdf"),
    },
  });
  await ready(f.runtime);
  assert.equal(f.counts().links, 0);
  assert.equal(f.counts().opens, 0);
  let started, finish;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  f.open(
    () =>
      new Promise((resolve) => {
        finish = resolve;
        started();
      }),
  );
  const opening = f.runtime.openPdf();
  await began;
  await f.runtime.openPdf();
  assert.equal(f.counts().opens, 1);
  await f.runtime.setActive(false);
  finish();
  await opening;
  assert.equal(f.counts().closes, 1);
  assert.equal(f.runtime.getSnapshot().metadata, null);
  await f.runtime.setActive(true);
  assert.equal(f.counts().opens, 1);
});
test("account replacement while obtaining receipt metadata hides the old result", async (t) => {
  const f = await fixture(t);
  const client = {
    ...f.client,
    receipt: () =>
      Effect.gen(function* () {
        yield* f.db.store.activate(
          { ...account, actor: "10000000-0000-4000-8000-000000000002" },
          "30000000-0000-4000-8000-000000000002",
        );
        return metadata;
      }),
  };
  const r = new ReceiptViewRuntime(
    receiptViewOperations({ store: f.db.store, session: f.db.session }, client, f.browser),
    target,
  );
  await ready(r);
  assert.equal(r.getSnapshot().metadata, null);
  assert.equal(r.getSnapshot().link, null);
  assert.equal(r.getSnapshot().verify, true);
  r.dispose();
});
test("expired or substituted signed links never become visible or open a browser", async (t) => {
  const f = await fixture(t);
  for (const value of [
    { ...link(), expiresAt: "1970-01-01T00:00:00.000Z" },
    link({
      ...metadata,
      receipt: {
        ...metadata.receipt,
        path: metadata.receipt.path.replace("000002.jpg", "000003.jpg"),
      },
    }),
  ]) {
    const r = new ReceiptViewRuntime(
      { ...f.operations, link: () => Effect.succeed(value) },
      target,
      () => 1,
    );
    await ready(r);
    assert.equal(r.getSnapshot().link, null);
    assert.match(r.getSnapshot().notice, /Could not/);
    r.dispose();
  }
  assert.equal(f.counts().opens, 0);
});
test("account revocation before PDF opening prevents the device handoff", async (t) => {
  const f = await fixture(t);
  f.value({
    ...metadata,
    receipt: {
      ...metadata.receipt,
      contentType: "application/pdf",
      path: metadata.receipt.path.replace(".jpg", ".pdf"),
    },
  });
  await ready(f.runtime);
  await run(
    f.db.store.activate(
      { ...account, actor: "10000000-0000-4000-8000-000000000002" },
      "30000000-0000-4000-8000-000000000002",
    ),
  );
  await f.runtime.openPdf();
  assert.equal(f.counts().opens, 0);
  assert.equal(f.runtime.getSnapshot().verify, true);
});
test("receipt owner clears ephemeral content on unsubscribe and recreates a live empty runtime", async (t) => {
  const f = await fixture(t),
    owner = receiptViewOwner(f.operations, target);
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await ready(first);
  assert.notEqual(first.getSnapshot().metadata, null);
  stop();
  assert.equal(first.getSnapshot().metadata, null);
  assert.equal(owner.getSnapshot(), null);
  const stopAgain = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  assert.equal(owner.getSnapshot().getSnapshot().metadata, null);
  stopAgain();
});
