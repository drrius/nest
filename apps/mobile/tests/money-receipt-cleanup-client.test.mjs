import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fetch from "effect/unstable/http/FetchHttpClient";
import { receiptCleanupClient } from "../src/money/receipt-cleanup-client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) },
  input = { uploadId: id(100), sha256: "a".repeat(64), bytes: 128, contentType: "image/jpeg" };
const value = {
  version: 1,
  householdId: id(10),
  uploadId: id(100),
  path: `${id(10)}/receipts/${id(100)}.jpg`,
  status: "deleted",
};
const client = receiptCleanupClient(
  "https://api.example/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "token" }),
);
const run = (command, fetcher) =>
  Effect.runPromise(
    client.cleanupReceipt(command).pipe(Effect.provideService(Fetch.Fetch, fetcher)),
  );
test("native cleanup binds its exact identity and rejects incomplete or substituted results", async () => {
  let calls = 0;
  const result = await run(input, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.example/v1/money/receipt/cleanup");
    assert.deepEqual(JSON.parse(init.body), input);
    assert.equal(new Headers(init.headers).get("x-nest-household"), account.household);
    return Response.json(value);
  });
  assert.deepEqual(result, value);
  assert.equal(calls, 1);
  for (const patch of [
    { householdId: id(20) },
    { uploadId: id(101) },
    { path: value.path.replace(".jpg", ".pdf") },
    { status: "deleting" },
    { extra: true },
  ])
    await assert.rejects(
      run(input, async () => Response.json({ ...value, ...patch })),
      { code: "unavailable" },
    );
  await assert.rejects(
    run({ ...input, unexpected: true }, async () => {
      throw Error("must not dispatch");
    }),
    { code: "invalid" },
  );
});
