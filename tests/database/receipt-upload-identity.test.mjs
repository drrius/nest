import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, as, id } from "./receipt-storage-fixture.mjs";
const input = (n = 100, patch = {}) => ({
  uploadId: id(n),
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
  ...patch,
});
const reserve = (value = input(), home = 10) =>
  `select public.nest_reserve_receipt_upload('${id(home)}','${JSON.stringify(value)}')`;
function fixture(t) {
  const f = base(t);
  f.db.file("supabase/migrations/20260921173626_native_receipt_upload_identity.sql");
  return { ...f, read: (value = input()) => JSON.parse(f.db.sql(as(1, reserve(value)))) };
}
test("immutable native receipt identity binds uploader, type, bytes and digest before upload", (t) => {
  const f = fixture(t),
    value = input(),
    first = f.read(value);
  assert.deepEqual(first, {
    version: 1,
    householdId: id(10),
    uploaderId: id(1),
    ...value,
    path: f.path(100),
    stored: false,
  });
  assert.deepEqual(f.read(), first);
  for (const patch of [
    { sha256: "b".repeat(64) },
    { bytes: 129 },
    { contentType: "application/pdf" },
  ])
    assert.throws(() => f.read(input(100, patch)), /identity changed/);
  assert.throws(() => f.db.sql(as(2, reserve())), /Not authorized/);
  assert.throws(() => f.db.sql(as(3, reserve())), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${reserve()}`), /permission denied/);
  assert.throws(
    () => f.db.sql(as(1, "select * from private.nest_receipt_upload_intents")),
    /permission denied/,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "1");
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("lost upload acknowledgement recovers the same identity after claim without modifying financial history", (t) => {
  const f = fixture(t),
    before = f.read();
  f.db.sql(f.upload(before.path));
  assert.deepEqual(f.read(), { ...before, stored: true });
  f.record(f.save(before.path, "native-upload-claim"));
  assert.equal(f.state(before.path), "claimed");
  assert.deepEqual(f.read(), { ...before, stored: true });
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql(as(1, f.cleanup(before.path))), "");
});
test("legacy objects cannot silently acquire an asserted native digest; failed reservation rolls back", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.seed(path);
  assert.throws(() => f.read(), /no content identity/);
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "0");
  assert.equal(f.state(path), "pending");
});
test("invalid identity shapes and cleanup tombstones cannot produce a usable native reservation", (t) => {
  const f = fixture(t);
  for (const value of [
    null,
    {},
    input(100, { sha256: null }),
    input(100, { sha256: "A".repeat(64) }),
    input(100, { bytes: 11 }),
    input(100, { bytes: 4194305 }),
    input(100, { bytes: 12.5 }),
    input(100, { bytes: "128" }),
    input(100, { contentType: "image/png" }),
    input(100, { purpose: "documents" }),
  ])
    assert.throws(() => f.read(value), /Invalid upload identity/);
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "0");
  const first = f.read();
  f.db.sql(as(1, f.cleanup(first.path)));
  assert.throws(() => f.read(), /Upload unavailable/);
  f.db.sql(as(1, f.finish(first.path)));
  assert.throws(() => f.read(), /Upload unavailable/);
  assert.throws(() => f.db.sql(f.upload(first.path)), /no longer pending/);
});
test("concurrent retries have one identity; competing content can never adopt the winning ID", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(1, reserve()))),
  );
  assert.equal(new Set(results.map((x) => x.stdout.trim())).size, 1);
  const changed = await Promise.allSettled([
    f.db.concurrent(as(1, reserve(input(101)))),
    f.db.concurrent(as(1, reserve(input(101, { sha256: "b".repeat(64) })))),
  ]);
  assert.equal(changed.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(changed.filter((x) => x.status === "rejected").length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "2");
  assert.equal(f.db.sql("select count(*) from public.household_attachment_uploads"), "2");
});
test("native reservation and cleanup races retain tombstones and never authorize a delayed writer", async (t) => {
  const f = fixture(t);
  for (let n = 200; n < 208; n++) {
    const value = input(n),
      path = f.read(value).path;
    const results = await Promise.allSettled([
      f.db.concurrent(as(1, reserve(value))),
      f.db.concurrent(as(1, f.cleanup(path))),
    ]);
    assert.equal(results[1].status, "fulfilled");
    // Legacy cleanup uses SKIP LOCKED: an active reservation may be skipped.
    if (results[1].value.stdout.trim() === "") {
      assert.equal(f.state(path), "pending");
      assert.equal(f.db.sql(as(1, f.cleanup(path))), path);
    }
    assert.equal(f.state(path), "deleting");
    assert.throws(() => f.read(value), /Upload unavailable/);
    assert.throws(() => f.db.sql(f.upload(path)), /no longer pending/);
  }
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
});
