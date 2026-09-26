import { createHash } from "node:crypto";
import { receiptUploadClient } from "../../apps/mobile/src/money/receipt-upload-client.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createReceiptUploadHandler } from "../../packages/receipt-upload/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
const require = createRequire(
  new URL("../../packages/receipt-upload/package.json", import.meta.url),
);
const Redacted = require("effect/Redacted");
const Effect = require("effect/Effect");
const Fetch = require("effect/unstable/http/FetchHttpClient");
test("real upload HTTP authorizes and reserves exact content but never claims unavailable Storage succeeded", async (t) => {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921173626_native_receipt_upload_identity.sql",
    "supabase/migrations/20260921174450_native_receipt_writer_membership.sql",
    "supabase/migrations/20260921182441_native_receipt_cleanup.sql",
    "supabase/migrations/20260926102946_native_receipt_nonretryable_conflicts.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const server = nodeServer(
    createReceiptUploadHandler({
      url: f.url,
      publishableKey: "sb_publishable_fixture",
      credential: Redacted.make("fixture-only-no-storage-service"),
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/?uploadId=${id(100)}`;
  const send = (token, body = "%PDF-1.7\nfixture") =>
    fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) },
      body,
    });
  const bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
  const digest = (body) => Effect.succeed(createHash("sha256").update(body).digest("hex"));
  const native = receiptUploadClient(
    { origin: new URL(url).origin, upload: { publishableKey: "sb_publishable_fixture", digest } },
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const input = {
    uploadId: id(100),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    contentType: "application/pdf",
  };
  await assert.rejects(
    Effect.runPromise(
      native.uploadReceipt(input, bytes).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ),
    { code: "unavailable" },
  );
  const first = await send(f.bearer);
  assert.equal(first.status, 503);
  assert.deepEqual(await first.json(), { error: { code: "unavailable" } });
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "1");
  assert.equal(f.db.sql("select count(*) from storage.objects"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal((await send(f.bearer)).status, 503);
  assert.equal((await send(f.bearer, "%PDF-1.7\nchanged")).status, 409);
  assert.equal((await send(f.partnerBearer)).status, 403);
  assert.equal((await send("invalid-token")).status, 401);
  f.db.sql(`update public.household_members set household_id='${id(20)}' where user_id='${id(1)}'`);
  assert.equal((await send(f.bearer)).status, 403);
  assert.equal(f.db.sql("select count(*) from private.nest_receipt_upload_intents"), "1");
});
