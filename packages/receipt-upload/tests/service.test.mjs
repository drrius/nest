import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { fixture, request, pdf, home, actor, uploadId } from "./service-fixture.mjs";
test("inspected upload computes identity from bytes and confines its credential to one immutable Storage write", async (t) => {
  const f = fixture(t),
    response = await f.handler(request());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    version: 1,
    householdId: home,
    uploaderId: actor,
    uploadId,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    bytes: pdf.length,
    contentType: "application/pdf",
    path: `${home}/receipts/${uploadId}.pdf`,
    stored: true,
  });
  assert.equal(f.state.writes, 1);
  assert.equal(f.state.reads, 1);
  assert.equal(f.state.reserves, 2);
  assert.deepEqual(f.state.object, pdf);
});
test("lost upload acknowledgement and identical retries verify stored bytes without overwrite", async (t) => {
  const f = fixture(t);
  f.state.lost = true;
  const first = await f.handler(request());
  assert.equal(first.status, 201);
  assert.equal((await f.handler(request())).status, 201);
  assert.equal(f.state.writes, 1);
  assert.equal(f.state.reads, 2);
  const changed = new TextEncoder().encode("%PDF-1.7\nchanged");
  assert.equal((await f.handler(request(changed))).status, 409);
  assert.equal(f.state.writes, 1);
});
test("stored content and MIME mismatch cannot become a successful path-only recovery", async (t) => {
  const f = fixture(t);
  assert.equal((await f.handler(request())).status, 201);
  f.state.object = new Uint8Array(pdf);
  f.state.object[10] ^= 1;
  assert.equal((await f.handler(request())).status, 409);
  f.state.object = pdf;
  f.state.wrongMime = true;
  assert.equal((await f.handler(request())).status, 409);
  assert.equal(f.state.writes, 1);
});
test("invalid file, oversized bytes, query injection and anonymous identity never reach the writer", async (t) => {
  const f = fixture(t);
  for (const req of [
    request(new Uint8Array(12)),
    request(pdf, `uploadId=${uploadId}&purpose=documents`),
    request(pdf, `uploadId=${uploadId}&uploadId=${uploadId}`),
  ])
    assert.equal((await f.handler(req)).status, 400);
  assert.equal((await f.handler(request(new Uint8Array(4194305)))).status, 413);
  f.state.anonymous = true;
  assert.equal((await f.handler(request())).status, 401);
  assert.equal(f.state.writes, 0);
  assert.equal(f.state.reserves, 0);
});
test("forged reservation binding and authorization loss block upload or recovery", async (t) => {
  const f = fixture(t);
  f.state.wrongResponse = true;
  assert.equal((await f.handler(request())).status, 503);
  assert.equal(f.state.writes, 0);
  f.state.wrongResponse = false;
  f.state.denied = true;
  assert.equal((await f.handler(request())).status, 403);
  assert.equal(f.state.writes, 0);
});
test("failed Storage write remains uncertain and a real JPEG uses detected MIME despite the header", async (t) => {
  const f = fixture(t),
    bytes = new Uint8Array(
      jpeg.encode({ width: 2, height: 2, data: new Uint8Array(16).fill(255) }, 85).data,
    );
  f.state.writeFails = true;
  assert.equal((await f.handler(request(bytes))).status, 503);
  assert.equal(f.state.reads, 0);
  f.state.writeFails = false;
  assert.equal((await f.handler(request(bytes))).status, 201);
  assert.equal(f.state.intent.contentType, "image/jpeg");
  assert.match(f.state.intent.path, /\.jpg$/);
});

test("an old form cannot upload into a newly joined household or omit its expected household", async (t) => {
  const f = fixture(t);
  f.state.membershipHome = uploadId;
  assert.equal((await f.handler(request())).status, 403);
  f.state.membershipHome = home;
  const missing = request();
  missing.headers.delete("x-nest-household");
  assert.equal((await f.handler(missing)).status, 403);
  assert.equal(f.state.reserves, 0);
  assert.equal(f.state.writes, 0);
});
