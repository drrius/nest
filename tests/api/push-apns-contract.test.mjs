import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { apnsTokenSigner } from "../../apps/api/src/push/apns-token.ts";
import { apnsResponse } from "../../apps/api/src/push/apns-response.ts";

const id = "00000000-0000-4000-8000-000000000001";
const credentials = (key) => ({
  keyId: "TESTKEY001",
  teamId: "TESTTEAM01",
  privateKey: Redacted.make(key),
});
test("APNs JWT is real ES256, keeps signing material redacted, and reuses a 30-minute token", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  let now = 1800000000000;
  const sign = apnsTokenSigner(credentials(pem), () => now);
  const initial = sign();
  const token = Redacted.value(initial);
  const [header, claims, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), {
    alg: "ES256",
    kid: "TESTKEY001",
  });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), {
    iss: "TESTTEAM01",
    iat: 1800000000,
  });
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  assert.equal(
    verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
  assert.equal(JSON.stringify(initial).includes(token), false);
  now += 1799000;
  assert.equal(sign(), initial);
  now += 1000;
  assert.notEqual(Redacted.value(sign()), token);
  now -= 1000;
  assert.throws(() => sign(), /backwards/);
});

test("APNs signer rejects wrong keys, malformed identities and invalid clocks before sending", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
  const wrong = privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(() => apnsTokenSigner(credentials(wrong)), /P-256/);
  assert.throws(() => apnsTokenSigner({ ...credentials(wrong), keyId: "bad\nkey" }), /credentials/);
  assert.throws(() => apnsTokenSigner(credentials("SENSITIVE malformed key")), {
    message: "Invalid APNs signing key",
  });
  assert.throws(
    () => apnsTokenSigner({ ...credentials(wrong), teamId: "TESTTEAM01\n" }),
    /credentials/,
  );
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  for (const value of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER * 2000]) {
    const sign = apnsTokenSigner(
      credentials(pair.privateKey.export({ type: "pkcs8", format: "pem" })),
      () => value,
    );
    assert.throws(() => sign(), /time/);
  }
});

test("APNs response parsing binds exact IDs, accepts only empty 200, and preserves rejection age", () => {
  assert.deepEqual(apnsResponse({ status: 200, apnsId: id, body: "" }, id), {
    status: "provider_accepted",
    apnsId: id,
  });
  for (const response of [
    { status: 200, apnsId: "substituted", body: "" },
    { status: 200, apnsId: id, body: "{}" },
    { status: 410, apnsId: id, body: '{"reason":"Unregistered"}' },
    { status: 410, apnsId: id, body: '{"reason":"Unregistered","timestamp":-1}' },
    { status: 410, apnsId: id, body: '{"reason":"Unregistered","timestamp":1.5}' },
    { status: 503, apnsId: id, body: "not json" },
    { status: 503, apnsId: id, body: "null" },
    { status: 503, apnsId: id, body: "[]" },
    { status: 503, apnsId: id, body: "x".repeat(8193) },
    { status: 299, apnsId: id, body: '{"reason":"Unregistered"}' },
  ])
    assert.deepEqual(apnsResponse(response, id), { status: "unknown" });
  assert.deepEqual(
    apnsResponse(
      { status: 410, apnsId: id, body: '{"reason":"Unregistered","timestamp":1800000000000}' },
      id,
    ),
    { status: "rejected", reason: "invalid_device", invalidatedAt: 1800000000000 },
  );
  for (const [status, reason, expected] of [
    [400, "BadDeviceToken", "invalid_device"],
    [400, "DeviceTokenNotForTopic", "invalid_device"],
    [403, "InvalidProviderToken", "invalid_credentials"],
    [413, "PayloadTooLarge", "message_too_big"],
    [429, "TooManyRequests", "rate_limited"],
    [429, "TooManyProviderTokenUpdates", "rate_limited"],
    [500, "InternalServerError", "provider_unavailable"],
    [503, "Shutdown", "provider_unavailable"],
    [400, "BadTopic", "provider_rejected"],
  ])
    assert.deepEqual(apnsResponse({ status, apnsId: id, body: JSON.stringify({ reason }) }, id), {
      status: "rejected",
      reason: expected,
    });
});
