import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
test("actual cleanup HTTP API enforces RLS, tombstones absent uploads and never fakes unavailable Storage deletion", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921173626_native_receipt_upload_identity.sql",
    "supabase/migrations/20260921182441_native_receipt_cleanup.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}`,
    path = `${id(10)}/receipts/${id(101)}.jpg`;
  const input = (n) => ({
    uploadId: id(n),
    sha256: "a".repeat(64),
    bytes: 128,
    contentType: "image/jpeg",
  });
  const request = (n, token = f.bearer, suffix = "") =>
    fetch(`${origin}/v1/money/receipt/cleanup${suffix}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nest-household": id(10),
        "content-type": "application/json",
      },
      body: JSON.stringify(input(n)),
    });
  const deleted = await request(100);
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).status, "deleted");
  assert.equal((await request(100)).status, 200);
  assert.equal((await request(100, f.partnerBearer)).status, 403);
  assert.equal((await request(100, f.bearer, "?extra=true")).status, 400);
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_reserve_receipt_upload('${id(10)}','${JSON.stringify(input(101))}')`,
  );
  f.db.sql(
    `insert into storage.objects(bucket_id,name,metadata) values('household-files','${path}','{"mimetype":"image/jpeg","size":128}')`,
  );
  // This fixture has no working Storage endpoint; the real API must keep the object unresolved.
  const unresolved = await request(101);
  assert.equal(unresolved.status, 409);
  assert.equal(
    f.db.sql(`select state from public.household_attachment_uploads where path='${path}'`),
    "deleting",
  );
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
