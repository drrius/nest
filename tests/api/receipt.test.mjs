import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readReceipt, receiptLink, signedReceiptUrl } from "../../apps/api/src/money/receipt.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const config = { url: "https://fixture.supabase.co/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "A" },
  token: "fixture",
};
const path = `${id(10)}/receipts/${id(100)}.jpg`;
const target = { eventId: id(200) };
const metadata = {
  version: 1,
  householdId: id(10),
  target,
  receipt: { path, contentType: "image/jpeg", bytes: "128" },
};
const run = (effect, response) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(response))),
  );
test("receipt metadata rejects substituted targets, households and unexpected queries", async () => {
  assert.deepEqual(await run(readReceipt(config, caller, target), metadata), metadata);
  for (const value of [
    { ...metadata, householdId: id(20) },
    { ...metadata, target: { eventId: id(201) } },
    { ...metadata, receipt: { ...metadata.receipt, path: `${id(20)}/receipts/${id(100)}.jpg` } },
  ])
    await assert.rejects(run(readReceipt(config, caller, target), value), { code: "unavailable" });
  await assert.rejects(
    run(readReceipt(config, caller, { ...target, receiptPath: path }), metadata),
    { code: "invalid_request" },
  );
});
test("signed receipt response must target the authorized storage object with only one token", async () => {
  const signed = `/object/sign/household-files/${path}?token=fixture.jwt.signature`;
  for (const value of [
    `https://evil.test${signed}`,
    signed.replace(path, `${id(10)}/receipts/${id(101)}.jpg`),
    signed + "&download=x",
    signed + "&token=again",
    signed + "#fragment",
  ])
    assert.equal(signedReceiptUrl(config.url, path, value), null);
  assert.equal(signedReceiptUrl(config.url, path, signed), `${config.url}storage/v1${signed}`);
  const calls = [];
  const result = await Effect.runPromise(
    receiptLink(config, caller, target).pipe(
      Effect.provideService(Fetch.Fetch, async (url, init) => {
        calls.push(new URL(url).pathname);
        assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
        if (calls.length === 1) return Response.json(metadata);
        assert.deepEqual(JSON.parse(init.body), { expiresIn: 60 });
        return Response.json({ signedURL: signed });
      }),
    ),
  );
  assert.equal(calls.length, 2);
  assert.equal(result.url, `${config.url}storage/v1${signed}`);
  assert.deepEqual(result.metadata, metadata);
  await assert.rejects(run(receiptLink(config, caller, target), { ...metadata, receipt: null }), {
    code: "removed",
  });
});
