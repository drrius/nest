import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fetch from "effect/unstable/http/FetchHttpClient";
import { receiptClient } from "../src/money/receipt-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
const account = { actor: id(1), household: id(10) },
  target = { eventId: id(200) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const storage = "https://fixture.supabase.co/";
const path = `${id(10)}/receipts/${id(100)}.jpg`;
const metadata = {
  version: 1,
  householdId: id(10),
  target,
  receipt: { path, contentType: "image/jpeg", bytes: "128" },
};
const link = {
  metadata,
  url: `${storage}storage/v1/object/sign/household-files/${path}?token=a.b.c`,
  expiresAt: "2030-01-01T00:00:00.000Z",
};
const client = receiptClient("https://api.example.test/", account, credentials, storage);
const run = (effect, value, status = 200) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value, { status }))),
  );
test("native receipt reads bind household and target without saving or sending bytes", async () => {
  assert.deepEqual(await run(client.receipt(target), metadata), metadata);
  for (const value of [
    { ...metadata, target: { eventId: id(201) } },
    { ...metadata, householdId: id(20) },
  ])
    await assert.rejects(run(client.receipt(target), value), { code: "unavailable" });
  await assert.rejects(run(client.receipt({ receiptPath: path }), metadata), {
    code: "unavailable",
  });
  await assert.rejects(run(client.receipt(target), {}, 403), { code: "forbidden" });
  const wrong = receiptClient(
    "https://api.example.test/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "other" }),
    storage,
  );
  await assert.rejects(run(wrong.receipt(target), metadata), { code: "session" });
});
test("receipt links reject different origins, paths, credentials, fragments and incomplete configuration", async () => {
  assert.deepEqual(await run(client.receiptLink(target), link), link);
  for (const url of [
    link.url.replace("fixture.supabase.co", "evil.example"),
    link.url.replace(id(100), id(101)),
    link.url.replace("https://", "https://user:pass@"),
    link.url + "#fragment",
    link.url + "&download=foreign",
    "javascript:alert(1)",
  ])
    await assert.rejects(run(client.receiptLink(target), { ...link, url }), {
      code: "unavailable",
    });
  await assert.rejects(
    run(client.receiptLink(target), { ...link, metadata: { ...metadata, receipt: null } }),
    { code: "unavailable" },
  );
  await assert.rejects(run(client.receiptLink(target), { ...link, expiresAt: "garbage" }), {
    code: "unavailable",
  });
  const missing = receiptClient("https://api.example.test/", account, credentials);
  await assert.rejects(run(missing.receiptLink(target), link), { code: "unavailable" });
});
