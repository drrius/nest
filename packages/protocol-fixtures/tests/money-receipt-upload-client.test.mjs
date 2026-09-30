import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Fetch from "effect/unstable/http/FetchHttpClient";
import { receiptUploadClient } from "../src/money/receipt-upload-client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) },
  bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const input = { uploadId: id(100), sha256, bytes: bytes.length, contentType: "application/pdf" };
const receipt = {
  ...input,
  version: 1,
  householdId: id(10),
  uploaderId: id(1),
  path: `${id(10)}/receipts/${id(100)}.pdf`,
  stored: true,
};
const session = { user: { id: id(1) }, access_token: "fixture-token" };
const config = {
  origin: "https://fixture.supabase.co/",
  upload: {
    publishableKey: "sb_publishable_fixture",
    digest: (body) => Effect.succeed(createHash("sha256").update(body).digest("hex")),
  },
};
const client = receiptUploadClient(config, account, Effect.succeed(session));
const run = (effect, fetcher) =>
  Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetcher)));
test("native upload sends exact bytes with caller/public credentials and binds the server receipt", async () => {
  let calls = 0;
  const result = await run(client.uploadReceipt(input, bytes), async (url, init) => {
    calls++;
    assert.equal(
      String(url),
      `${config.origin}functions/v1/nest-receipt-upload?uploadId=${id(100)}`,
    );
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer fixture-token");
    assert.equal(headers.get("apikey"), "sb_publishable_fixture");
    assert.equal(headers.get("x-nest-household"), account.household);
    assert.equal(headers.get("content-type"), "application/pdf");
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.deepEqual(new Uint8Array(init.body), bytes);
    return Response.json(receipt, { status: 201 });
  });
  assert.deepEqual(result, receipt);
  assert.equal(calls, 1);
  for (const patch of [
    { stored: false },
    { sha256: "b".repeat(64) },
    { bytes: 19 },
    { uploaderId: id(2) },
    { householdId: id(20) },
    { uploadId: id(101) },
    { path: receipt.path.replace(".pdf", ".jpg") },
    { signedUrl: "https://foreign.example" },
  ])
    await assert.rejects(
      run(client.uploadReceipt(input, bytes), async () =>
        Response.json({ ...receipt, ...patch }, { status: 201 }),
      ),
      { code: "unavailable" },
    );
});
test("invalid file identity and missing or unsafe configuration never dispatch file bytes", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json(receipt, { status: 201 });
  };
  await assert.rejects(
    run(client.uploadReceipt({ ...input, sha256: "b".repeat(64) }, bytes), fetcher),
    { code: "invalid" },
  );
  await assert.rejects(run(client.uploadReceipt(input, bytes.slice(1)), fetcher), {
    code: "invalid",
  });
  await assert.rejects(
    run(client.uploadReceipt({ ...input, path: receipt.path }, bytes), fetcher),
    { code: "invalid" },
  );
  for (const bad of [
    undefined,
    { origin: config.origin },
    { ...config, origin: "http://foreign.example/" },
    { ...config, origin: "https://user:pass@fixture.supabase.co/" },
    { ...config, origin: "https://fixture.supabase.co/changed/" },
    { ...config, upload: { ...config.upload, publishableKey: "server-secret" } },
  ])
    await assert.rejects(
      run(
        receiptUploadClient(bad, account, Effect.succeed(session)).uploadReceipt(input, bytes),
        fetcher,
      ),
      { code: "unavailable" },
    );
  assert.equal(calls, 0);
});
test("account replacement during hashing or upload cannot dispatch or expose an old receipt", async () => {
  let current = session,
    calls = 0;
  const credentials = Effect.sync(() => current);
  const other = { ...session, user: { id: id(2) } };
  const changing = {
    ...config,
    upload: {
      ...config.upload,
      digest: () =>
        Effect.sync(() => {
          current = other;
          return sha256;
        }),
    },
  };
  await assert.rejects(
    run(
      receiptUploadClient(changing, account, credentials).uploadReceipt(input, bytes),
      async () => {
        calls++;
        return Response.json(receipt, { status: 201 });
      },
    ),
    { code: "session" },
  );
  assert.equal(calls, 0);
  current = session;
  await assert.rejects(
    run(receiptUploadClient(config, account, credentials).uploadReceipt(input, bytes), async () => {
      current = other;
      return Response.json(receipt, { status: 201 });
    }),
    { code: "session" },
  );
});
test("upload failures are finite and never automatically retried", async () => {
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [413, "invalid"],
    [503, "unavailable"],
  ]) {
    let calls = 0;
    await assert.rejects(
      run(client.uploadReceipt(input, bytes), async () => {
        calls++;
        return Response.json({ error: { code } }, { status });
      }),
      { code },
    );
    assert.equal(calls, 1);
  }
});
test("upload captures a bounded byte copy before asynchronous hashing", async () => {
  const selected = bytes.slice();
  const settings = {
    ...config,
    upload: {
      ...config.upload,
      digest: (body) =>
        Effect.sync(() => {
          selected.fill(0);
          return createHash("sha256").update(body).digest("hex");
        }),
    },
  };
  const result = await run(
    receiptUploadClient(settings, account, Effect.succeed(session)).uploadReceipt(input, selected),
    async (_, init) => {
      assert.deepEqual(new Uint8Array(init.body), bytes);
      return Response.json(receipt, { status: 201 });
    },
  );
  assert.deepEqual(result, receipt);
  assert.equal(selected[0], 0);
});
