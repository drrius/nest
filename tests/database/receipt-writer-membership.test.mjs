import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
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

test("service-role uploads still refuse a revoked uploader despite bypassing RLS", (t) => {
  const f = reservedFixture(t);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(
    () => f.db.sql(`set role service_role; ${f.upload(f.path(101))}`),
    /no longer authorized/,
  );
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.state(f.path(101)), "pending");
});

test("membership revocation waits for an authorized privileged insert transaction", async (t) => {
  const f = reservedFixture(t);
  const before = f.db.sql(
    "select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.financial_events e",
  );
  const writing = f.db.concurrent(`set application_name='receipt-authorized-writer';
    begin; set local role service_role; ${f.upload(f.path(101))}; select pg_sleep(1); commit`);
  let revoking;
  try {
    await waitFor(f.db, "receipt-authorized-writer", "wait_event='PgSleep'");
    revoking = f.db.concurrent(`set application_name='receipt-member-revoker';
      delete from public.household_members where user_id='${id(1)}'`);
    await waitFor(f.db, "receipt-member-revoker", "wait_event_type='Lock'");
    assert.equal(
      f.db.sql(`select count(*) from public.household_members where user_id='${id(1)}'`),
      "1",
    );
    await writing;
    await revoking;
    assert.equal(
      f.db.sql(`select count(*) from public.household_members where user_id='${id(1)}'`),
      "0",
    );
    assert.equal(f.db.sql(`select count(*) from storage.objects where name='${f.path(101)}'`), "1");
    assert.equal(
      f.db.sql(
        "select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]') from public.financial_events e",
      ),
      before,
    );
  } finally {
    await Promise.allSettled([writing, ...(revoking ? [revoking] : [])]);
  }
});

function reservedFixture(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921173626_native_receipt_upload_identity.sql");
  f.db.file("supabase/migrations/20260921174450_native_receipt_writer_membership.sql");
  const input = {
    uploadId: id(101),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  };
  f.db.sql(
    as(1, `select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(input)}')`),
  );
  return f;
}

async function waitFor(db, application, condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and ${condition}`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing observed database barrier for ${application}`);
}
