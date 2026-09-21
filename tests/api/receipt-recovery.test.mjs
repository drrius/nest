import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readReceiptUploads } from "../../apps/api/src/money/receipt-recovery.ts";
import { receiptCleanupClient } from "../../apps/mobile/src/money/receipt-cleanup-client.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = {
  uploadId: id(100),
  sha256: "a".repeat(64),
  bytes: 128,
  contentType: "image/jpeg",
  path: `${id(10)}/receipts/${id(100)}.jpg`,
  status: "pending",
  stored: true,
  createdAt: "2026-09-21T10:00:00.000000Z",
};
const value = {
  version: 1,
  householdId: id(10),
  uploaderId: id(1),
  after: null,
  next: null,
  uploads: [row],
};
const config = { url: "https://fixture.supabase.co/", publishableKey: "sb_publishable_fixture" };
const caller = { member: { userId: id(1), householdId: id(10) }, token: "fixture" };
const run = (effect, response) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(response))),
  );
test("recovery API rejects foreign owner/cursor, unordered rows and unsafe paths", async () => {
  const read = () => readReceiptUploads(config, caller, { after: null });
  assert.deepEqual(await run(read(), value), value);
  for (const patch of [
    { uploaderId: id(2) },
    { householdId: id(20) },
    { after: id(99) },
    { next: id(100) },
    { uploads: [row, row] },
    { uploads: [{ ...row, path: `${id(20)}/receipts/${id(100)}.jpg` }] },
    { uploads: [{ ...row, status: "claimed" }] },
    { uploads: [{ ...row, createdAt: "invalid" }] },
  ])
    await assert.rejects(run(read(), { ...value, ...patch }), { code: "unavailable" });
  await assert.rejects(
    run(readReceiptUploads(config, caller, { after: null, owner: id(2) }), value),
    { code: "invalid_request" },
  );
});
test("native recovery remains an authorized read and rejects substituted membership or cursor", async () => {
  const client = receiptCleanupClient(
    "https://api.example/",
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
  );
  const result = await Effect.runPromise(
    client.receiptUploads().pipe(
      Effect.provideService(Fetch.Fetch, async (url, init) => {
        assert.equal(init.method, "GET");
        assert.equal(new URL(url).pathname, "/v1/money/receipt/uploads");
        assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
        return Response.json(value);
      }),
    ),
  );
  assert.deepEqual(result, value);
  for (const patch of [{ uploaderId: id(2) }, { householdId: id(20) }, { after: id(99) }])
    await assert.rejects(run(client.receiptUploads(), { ...value, ...patch }), {
      code: "unavailable",
    });
});
