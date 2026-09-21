import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id } from "./receipt-storage-fixture.mjs";
test("privileged native uploads are blocked after membership is revoked following reservation", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921173626_native_receipt_upload_identity.sql");
  f.db.file("supabase/migrations/20260921174450_native_receipt_writer_membership.sql");
  const input = {
    uploadId: id(100),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  };
  f.db.sql(
    as(1, `select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(input)}')`),
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.db.sql(f.upload(f.path(100))), /no longer authorized/);
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.state(f.path(100)), "pending");
});
