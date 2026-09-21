import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { ReceiptRecoveryRuntime } from "../../apps/mobile/src/money/receipt-recovery-runtime.ts";
import { receiptRecoveryOperations } from "../../apps/mobile/src/money/receipt-recovery-operations.ts";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("actual cleanup HTTP API enforces RLS, tombstones absent uploads and never fakes unavailable Storage deletion", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921173626_native_receipt_upload_identity.sql",
    "supabase/migrations/20260921182441_native_receipt_cleanup.sql",
    "supabase/migrations/20260921184008_native_receipt_recovery.sql",
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
  const client = moneyClient(
    origin,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
  assert.equal((await run(client.cleanupReceipt(input(100)))).status, "deleted");
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
  const recovery = await run(client.receiptUploads());
  assert.equal(recovery.uploads.length, 1);
  assert.equal(recovery.uploads[0].uploadId, id(101));
  assert.equal(recovery.uploads[0].status, "pending");
  assert.equal(recovery.uploads[0].stored, true);
  // This fixture has no working Storage endpoint; the real API must keep the object unresolved.
  await assert.rejects(run(client.cleanupReceipt(input(101))), { code: "conflict" });
  const unresolved = await request(101);
  assert.equal(unresolved.status, 409);
  assert.equal(
    f.db.sql(`select state from public.household_attachment_uploads where path='${path}'`),
    "deleting",
  );
  assert.equal((await run(client.receiptUploads())).uploads[0].status, "deleting");
  assert.equal(f.db.sql("select count(*) from storage.objects"), "1");
  await verifyRecoveryRuntime(t, client, run);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

async function verifyRecoveryRuntime(t, client, run) {
  const local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(999)));
  const scopedClient = {
    ...client,
    receiptUploads: (after) =>
      client.receiptUploads(after).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    cleanupReceipt: (input) =>
      client.cleanupReceipt(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
  };
  const runtime = new ReceiptRecoveryRuntime(
    receiptRecoveryOperations({ store: local.store, session }, scopedClient),
  );
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const row = runtime.getSnapshot().page.uploads[0];
  assert.equal(row.status, "deleting");
  await runtime.remove(row);
  assert.equal(runtime.getSnapshot().page, null);
  assert.match(runtime.getSnapshot().notice, /Could not confirm/);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().page.uploads[0].status, "deleting");
  runtime.dispose();
}
