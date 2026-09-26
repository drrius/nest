import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
import { payload, save } from "../database/native-expense-helpers.mjs";

const as = (actor, sql) =>
  `set role authenticated; set request.jwt.claims='{"sub":"${id(actor)}"}'; ${sql}`;
function visible(f, actor, path) {
  return f.db.sql(as(actor, `select count(*) from storage.objects where name='${path}'`));
}
function reserve(f, n) {
  const input = { uploadId: id(n), sha256: "a".repeat(64), bytes: 128, contentType: "image/jpeg" };
  const reserved = JSON.parse(
    f.db.sql(
      as(1, `select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(input)}')`),
    ),
  );
  f.db.sql(`insert into storage.objects(bucket_id,name,metadata)
    values('household-files','${reserved.path}','{"mimetype":"image/jpeg","size":128}')`);
  return { input, path: reserved.path };
}
test("Storage RLS keeps unposted native receipt bytes private and shares only financial attachments", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921173626_native_receipt_upload_identity.sql",
    "supabase/migrations/20260921182441_native_receipt_cleanup.sql",
    "supabase/migrations/20260926103200_native_receipt_storage_privacy.sql",
    "supabase/migrations/20260926103844_native_receipt_claim_owner.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const first = reserve(f, 100);
  assert.deepEqual(
    [1, 2, 3].map((actor) => visible(f, actor, first.path)),
    ["1", "0", "0"],
  );
  assert.equal(f.db.sql(`set role anon; select count(*) from storage.objects`), "0");
  const before = f.db.sql(`select jsonb_build_object(
    'events', (select jsonb_agg(e) from public.financial_events e),
    'uploads', (select jsonb_agg(u order by path) from public.household_attachment_uploads u),
    'ledger', (select jsonb_agg(l) from public.ledger_entries l))`);
  assert.throws(
    () => f.db.sql(as(2, save(201, payload({ receiptPath: first.path })))),
    /Only the uploader can attach a pending receipt/,
  );
  assert.equal(
    f.db.sql(`select jsonb_build_object(
    'events', (select jsonb_agg(e) from public.financial_events e),
    'uploads', (select jsonb_agg(u order by path) from public.household_attachment_uploads u),
    'ledger', (select jsonb_agg(l) from public.ledger_entries l))`),
    before,
  );
  assert.equal(visible(f, 2, first.path), "0");
  f.db.sql(as(1, save(200, payload({ receiptPath: first.path }))));
  assert.deepEqual(
    [1, 2, 3].map((actor) => visible(f, actor, first.path)),
    ["1", "1", "0"],
  );
  const second = reserve(f, 101);
  f.db.sql(
    as(
      1,
      `select public.nest_cleanup_receipt_upload('${id(10)}','${JSON.stringify(second.input)}',false)`,
    ),
  );
  assert.deepEqual(
    [1, 2, 3].map((actor) => visible(f, actor, second.path)),
    ["1", "0", "0"],
  );
  assert.equal(
    f.db.sql(
      as(
        2,
        `with removed as (delete from storage.objects where name='${second.path}' returning id) select count(*) from removed`,
      ),
    ),
    "0",
  );
  assert.equal(
    f.db.sql(
      as(
        1,
        `with removed as (delete from storage.objects where name='${second.path}' returning id) select count(*) from removed`,
      ),
    ),
    "1",
  );
  f.db.sql(
    as(
      1,
      `select public.nest_cleanup_receipt_upload('${id(10)}','${JSON.stringify(second.input)}',true)`,
    ),
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  const legacy = `${id(10)}/receipts/${id(102)}.jpg`;
  f.db.sql(as(1, `select public.reserve_household_attachment('${legacy}','image/jpeg')`));
  f.db.sql(`insert into storage.objects(bucket_id,name,metadata)
    values('household-files','${legacy}','{"mimetype":"image/jpeg","size":128}')`);
  assert.deepEqual(
    [1, 2, 3].map((actor) => visible(f, actor, legacy)),
    ["1", "1", "0"],
  );
});
