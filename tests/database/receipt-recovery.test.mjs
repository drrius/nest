import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, as, id } from "./receipt-storage-fixture.mjs";
const input = (n) => ({
  uploadId: id(n),
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
});
/** @param {number} home @param {string | null} after */
const query = (home = 10, after = null) =>
  `select public.nest_read_receipt_uploads('${id(home)}',${after ? `'${after}'` : "null"})`;
function fixture(t) {
  const f = base(t);
  for (const name of [
    "20260921173626_native_receipt_upload_identity.sql",
    "20260921182441_native_receipt_cleanup.sql",
    "20260921184008_native_receipt_recovery.sql",
  ])
    f.db.file(`supabase/migrations/${name}`);
  return {
    ...f,
    reserve: (n, actor = 1, home = 10) =>
      f.db.sql(
        as(
          actor,
          `select public.nest_reserve_receipt_upload('${id(home)}','${JSON.stringify(input(n))}')`,
        ),
      ),
    read: (actor = 1, after = null) => JSON.parse(f.db.sql(as(actor, query(10, after)))),
    clean: (n) =>
      f.db.sql(
        as(
          1,
          `select public.nest_cleanup_receipt_upload('${id(10)}','${JSON.stringify(input(n))}',false)`,
        ),
      ),
  };
}
test("recovery lists only current uploader's pending/deleting native identities, with truthful object presence", (t) => {
  const f = fixture(t);
  for (let n = 100; n < 105; n++) f.reserve(n);
  f.reserve(105, 2);
  f.reserve(106, 3, 20);
  f.db.sql(f.upload(f.path(101)));
  f.db.sql(f.upload(f.path(102)));
  f.clean(102);
  f.clean(103);
  f.db.sql(f.upload(f.path(104)));
  f.record(f.save(f.path(104), "recovery-claimed"));
  const rows = f.read();
  assert.equal(rows.uploaderId, id(1));
  assert.equal(rows.householdId, id(10));
  assert.deepEqual(
    rows.uploads.map((x) => [x.uploadId, x.status, x.stored]),
    [
      [id(100), "pending", false],
      [id(101), "pending", true],
      [id(102), "deleting", true],
    ],
  );
  for (const row of rows.uploads) {
    assert.equal(row.path, f.path(Number(row.uploadId.slice(-12))));
    assert.equal(row.sha256, input(100).sha256);
    assert.equal(row.bytes, 128);
  }
  assert.deepEqual(
    f.read(2).uploads.map((x) => x.uploadId),
    [id(105)],
  );
  assert.throws(() => f.read(3), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${query()}`), /permission denied/);
  assert.equal(f.state(f.path(100)), "pending");
  assert.equal(f.state(f.path(102)), "deleting");
});
test("recovery keyset pagination is bounded, ordered and does not mutate uploads", (t) => {
  const f = fixture(t);
  for (let n = 200; n < 252; n++) f.reserve(n);
  const first = f.read();
  assert.equal(first.uploads.length, 50);
  assert.equal(first.next, id(249));
  const second = f.read(1, first.next);
  assert.deepEqual(
    second.uploads.map((x) => x.uploadId),
    [id(250), id(251)],
  );
  assert.equal(second.next, null);
  assert.equal(second.after, first.next);
  f.clean(250);
  assert.deepEqual(
    f.read(1, first.next).uploads.map((x) => x.uploadId),
    [id(251)],
  );
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.read(), /Not authorized/);
});
