import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, as, id } from "./receipt-storage-fixture.mjs";
const input = (n = 100) => ({
  uploadId: id(n),
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
});
const cleanup = (value = input(), finish = false, home = 10) =>
  `select public.nest_cleanup_receipt_upload('${id(home)}','${JSON.stringify(value)}',${finish})`;
const reserve = (value = input()) =>
  `select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(value)}')`;
function fixture(t) {
  const f = base(t);
  f.db.file("supabase/migrations/20260921173626_native_receipt_upload_identity.sql");
  f.db.file("supabase/migrations/20260921182441_native_receipt_cleanup.sql");
  return {
    ...f,
    clean: (value = input(), finish = false) => JSON.parse(f.db.sql(as(1, cleanup(value, finish)))),
  };
}
test("cleanup tombstones an upload before reservation and forbids delayed insertion", (t) => {
  const f = fixture(t),
    result = f.clean();
  assert.deepEqual(result, {
    version: 1,
    householdId: id(10),
    uploadId: id(100),
    path: f.path(100),
    status: "deleted",
  });
  assert.deepEqual(f.clean(), result);
  assert.deepEqual(f.clean(input(), true), result);
  assert.throws(() => f.db.sql(as(1, reserve())), /Upload unavailable/);
  assert.throws(() => f.db.sql(f.upload(f.path(100))), /no longer pending/);
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("cleanup requires exact identity and current uploader membership and cannot adopt legacy files", (t) => {
  const f = fixture(t);
  f.db.sql(as(1, reserve()));
  for (const actor of [2, 3]) assert.throws(() => f.db.sql(as(actor, cleanup())), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${cleanup()}`), /permission denied/);
  assert.throws(() => f.clean({ ...input(), sha256: "b".repeat(64) }), /identity changed/);
  assert.throws(() => f.clean({ ...input(), authority: "owner" }), /Invalid upload identity/);
  assert.throws(() => f.db.sql(as(1, cleanup(input(), false, 20))), /Not authorized/);
  assert.throws(() => f.clean(input(101), true), /Not authorized/);
  f.seed(f.path(102));
  assert.throws(() => f.clean(input(102)), /no content identity/);
  assert.equal(f.state(f.path(102)), "pending");
  assert.equal(
    f.db.sql(
      `select count(*) from private.nest_receipt_upload_intents where upload_id='${id(102)}'`,
    ),
    "0",
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.clean(), /Not authorized/);
});
test("cleanup never deletes Storage metadata itself and completes only after object absence", (t) => {
  const f = fixture(t);
  f.db.sql(as(1, reserve()));
  f.db.sql(f.upload(f.path(100)));
  assert.equal(f.clean().status, "deleting");
  assert.equal(f.clean().status, "deleting");
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
  assert.throws(() => f.clean(input(), true), /Cleanup not complete/);
  // Synthetic Storage interface only: production must use the Storage HTTP API.
  f.db.sql(as(1, `delete from storage.objects where name='${f.path(100)}'`));
  assert.equal(f.clean(input(), true).status, "deleted");
  assert.equal(f.clean().status, "deleted");
  assert.throws(() => f.db.sql(f.upload(f.path(100))), /no longer pending/);
});
test("claimed financial receipt survives cleanup and concurrent claim/cleanup has one safe winner", async (t) => {
  const f = fixture(t);
  f.db.sql(as(1, reserve()));
  f.db.sql(f.upload(f.path(100)));
  f.record(f.save(f.path(100), "cleanup-claimed"));
  assert.equal(f.clean().status, "claimed");
  assert.equal(f.clean(input(), true).status, "claimed");
  assert.equal(f.state(f.path(100)), "claimed");
  for (let n = 200; n < 208; n++) {
    const value = input(n),
      path = f.path(n);
    f.db.sql(as(1, reserve(value)));
    f.db.sql(f.upload(path));
    const outcomes = await Promise.allSettled([
      f.db.concurrent(as(1, f.save(path, `cleanup-race-${n}`))),
      f.db.concurrent(as(1, cleanup(value))),
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    const status = JSON.parse(outcomes[1].value.stdout.trim()).status;
    if (status === "claimed") {
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(f.clean(value, true).status, "claimed");
      f.db.sql(as(1, `delete from storage.objects where name='${path}'`));
      assert.equal(f.db.sql(`select count(*) from storage.objects where name='${path}'`), "1");
    } else {
      assert.equal(status, "deleting");
      assert.equal(outcomes[0].status, "rejected");
      assert.equal(f.state(path), "deleting");
    }
  }
});
