import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, as, id } from "./receipt-storage-fixture.mjs";

const input = (n) => ({
  uploadId: id(n),
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
});
const reserve = (n) =>
  `select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(input(n))}')`;
const sweep = "select * from public.begin_household_attachment_cleanup()";

function fixture(t) {
  const f = base(t);
  for (const name of [
    "20260921173626_native_receipt_upload_identity.sql",
    "20260921182441_native_receipt_cleanup.sql",
    "20260926103200_native_receipt_storage_privacy.sql",
    "20260926103844_native_receipt_claim_owner.sql",
    "20261004134604_native_receipt_legacy_cleanup_owner.sql",
  ])
    f.db.file(`supabase/migrations/${name}`);
  const native = (n, actor = 1) => {
    f.db.sql(as(actor, reserve(n)));
    f.db.sql(f.upload(f.path(n)));
  };
  const age = (n) =>
    f.db.sql(`update public.household_attachment_uploads
    set created_at=now()-interval '25 hours' where path='${f.path(n)}'`);
  return { ...f, native, age };
}

test("legacy sweep preserves the partner's old private native receipt and exact upload retry", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.native(100);
  f.age(100);
  assert.equal(f.db.sql(as(2, sweep)), "");
  assert.equal(f.state(path), "pending");
  assert.equal(JSON.parse(f.db.sql(as(1, reserve(100)))).stored, true);
  assert.equal(f.db.sql(as(2, `select count(*) from storage.objects where name='${path}'`)), "0");
  assert.equal(f.db.sql(as(1, `select count(*) from storage.objects where name='${path}'`)), "1");
});

test("legacy finish cannot advance another native uploader's interrupted cleanup", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.native(100);
  assert.equal(f.db.sql(as(1, f.cleanup(path))), path);
  f.db.sql(as(1, `delete from storage.objects where name='${path}'`));
  f.db.sql(as(2, f.finish(path)));
  assert.equal(f.state(path), "deleting");
  assert.equal(f.db.sql(as(2, sweep)), "");
  f.db.sql(as(1, f.finish(path)));
  assert.equal(f.state(path), "deleted");
});

test("legacy abandoned files remain household-cleanable while recent files require their uploader", (t) => {
  const f = fixture(t);
  f.seed(f.path(100));
  f.age(100);
  f.seed(f.path(101));
  assert.equal(f.db.sql(as(2, sweep)), f.path(100));
  assert.equal(f.state(f.path(101)), "pending");
  assert.equal(f.db.sql(as(2, f.cleanup(f.path(101)))), "");
  f.db.sql(as(2, `delete from storage.objects where name='${f.path(100)}'`));
  f.db.sql(as(2, f.finish(f.path(100))));
  assert.equal(f.state(f.path(100)), "deleted");
  assert.equal(f.db.sql(as(1, f.cleanup(f.path(101)))), f.path(101));
});

test("native owner cleanup remains retryable and cannot finish while bytes are present", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.native(100);
  f.age(100);
  assert.equal(f.db.sql(as(1, sweep)), path);
  assert.equal(f.db.sql(as(1, sweep)), path);
  f.db.sql(as(1, f.finish(path)));
  assert.equal(f.state(path), "deleting");
  assert.equal(f.db.sql(as(2, f.cleanup(path))), "");
  f.db.sql(as(2, `delete from storage.objects where name='${path}'`));
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
  f.db.sql(as(1, `delete from storage.objects where name='${path}'`));
  f.db.sql(as(1, f.finish(path)));
  assert.equal(f.state(path), "deleted");
  assert.throws(() => f.db.sql(as(1, reserve(100))), /Upload unavailable/);
});

test("claimed financial receipts remain shared and immutable through both legacy cleanup paths", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.native(100);
  f.age(100);
  f.record(f.save(path, "legacy-cleanup-claimed"));
  const before = f.db.sql(
    "select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e",
  );
  for (const actor of [1, 2]) {
    assert.equal(f.db.sql(as(actor, sweep)), "");
    assert.equal(f.db.sql(as(actor, f.cleanup(path))), "");
    f.db.sql(as(actor, f.finish(path)));
    assert.equal(
      f.db.sql(as(actor, `select count(*) from storage.objects where name='${path}'`)),
      "1",
    );
  }
  assert.equal(f.state(path), "claimed");
  assert.equal(
    f.db.sql("select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e"),
    before,
  );
});

test("legacy cleanup denies anonymous, unaffiliated and removed uploaders", (t) => {
  const f = fixture(t),
    path = f.path(100);
  f.native(100);
  f.age(100);
  f.db.sql(`insert into auth.users(id) values('${id(4)}')`);
  assert.equal(f.db.sql(as(3, sweep)), "");
  assert.throws(() => f.db.sql(as(4, sweep)), /Not a household member/);
  assert.throws(() => f.db.sql(`set role anon; ${sweep}`), /permission denied/);
  assert.throws(() => f.db.sql(`set role anon; ${f.finish(path)}`), /permission denied/);
  f.db.sql(as(3, f.finish(path)));
  f.db.sql(as(4, f.finish(path)));
  assert.equal(f.state(path), "pending");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.db.sql(as(1, sweep)), /Not a household member/);
  assert.equal(f.db.sql(as(2, sweep)), "");
  assert.equal(f.state(path), "pending");
});

test("legacy cleanup and native financial claim retain one safe winner", async (t) => {
  const f = fixture(t);
  for (let n = 200; n < 208; n++) {
    const path = f.path(n);
    f.native(n);
    f.age(n);
    const results = await Promise.allSettled([
      f.db.concurrent(as(1, f.save(path, `legacy-cleanup-race-${n}`))),
      f.db.concurrent(as(1, f.cleanup(path))),
      f.db.concurrent(as(2, sweep)),
    ]);
    assert.equal(results[1].status, "fulfilled");
    assert.equal(results[2].status, "fulfilled");
    assert.equal(results[2].value.stdout.trim(), "");
    const state = f.state(path);
    if (state === "claimed") {
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].value.stdout.trim(), "");
    } else {
      assert.equal(state, "deleting");
      assert.equal(results[0].status, "rejected");
      assert.equal(results[1].value.stdout.trim(), path);
    }
    assert.equal(f.db.sql(`select count(*) from storage.objects where name='${path}'`), "1");
  }
});
