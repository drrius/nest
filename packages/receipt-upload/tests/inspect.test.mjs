import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { inspectAttachment, JPEG_DECODE_LIMITS } from "../src/inspect.ts";
const small = new Uint8Array(
  jpeg.encode({ width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(255) }, 85).data,
);
const fixture = (name) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}.jpg`, import.meta.url)));
const marker = (bytes, value) =>
  bytes.findIndex((byte, i) => byte === 255 && bytes[i + 1] === value);
test("real decoder accepts baseline, progressive and restart JPEGs without changing bytes", () => {
  const exif = [
    255, 225, 0, 22, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];
  const annotated = new Uint8Array([
    ...small.slice(0, 2),
    ...exif,
    255,
    254,
    0,
    6,
    84,
    101,
    115,
    116,
    ...small.slice(2),
  ]);
  for (const bytes of [small, fixture("progressive"), fixture("restarts"), annotated]) {
    const before = bytes.slice();
    assert.deepEqual(inspectAttachment(bytes), { extension: "jpg", mime: "image/jpeg" });
    assert.deepEqual(bytes, before);
  }
});
test("maximum normalized 2000px image decodes under explicit memory and resolution caps", () => {
  const bytes = jpeg.encode(
    { width: 2000, height: 2000, data: new Uint8Array(2000 * 2000 * 4).fill(255) },
    85,
  ).data;
  assert.ok(bytes.length < 4 * 1024 * 1024);
  assert.equal(inspectAttachment(bytes)?.mime, "image/jpeg");
  assert.equal(JPEG_DECODE_LIMITS.maxResolutionInMP, 4);
  assert.equal(JPEG_DECODE_LIMITS.maxMemoryUsageInMB, 96);
  assert.equal(JPEG_DECODE_LIMITS.tolerantDecoding, false);
});
test("forged, truncated, concatenated and appended JPEGs are rejected", () => {
  for (const bytes of [
    new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 255, 217]),
    small.slice(0, -2),
    new Uint8Array([...small.slice(0, -8), 255, 217]),
    new Uint8Array([...small, 60, 115, 99, 114, 105, 112, 116, 62]),
    new Uint8Array([...small, ...small]),
  ])
    assert.equal(inspectAttachment(bytes), null);
});
test("missing scans, malformed entropy and partial restart decoding are rejected", () => {
  const scan = marker(small, 0xda),
    start = scan + 2 + small[scan + 2] * 256 + small[scan + 3];
  const bytes = fixture("restarts"),
    restart = marker(bytes, 0xd0),
    wrong = bytes.slice();
  assert.ok(restart > 0);
  wrong[restart + 1] = 0xd4;
  for (const value of [
    new Uint8Array([...small.slice(0, scan), 255, 217]),
    new Uint8Array([...small.slice(0, start), 0, 255, 217]),
    new Uint8Array([...bytes.slice(0, restart), 255, 217]),
    wrong,
  ])
    assert.equal(inspectAttachment(value), null);
});
test("byte, dimension and component bounds reject before invoking the decoder", () => {
  let calls = 0;
  const decode = (bytes, options) => {
    calls++;
    return jpeg.decode(bytes, options);
  };
  const tooWide = small.slice(),
    frame = marker(tooWide, 0xc0);
  tooWide[frame + 7] = 0x7f;
  tooWide[frame + 8] = 0xff;
  const samples = [tooWide, new Uint8Array(4 * 1024 * 1024 + 1), new Uint8Array(0)];
  for (const byte of [0, 0x55, 0xff]) {
    const invalid = small.slice();
    invalid[frame + 11] = byte;
    samples.push(invalid);
  }
  for (const bytes of samples) assert.equal(inspectAttachment(bytes, decode), null);
  assert.equal(calls, 0);
});
test("decoder output must agree with the parsed frame and full pixel count", () => {
  for (const image of [
    { width: 17, height: 16, data: new Uint8Array(16 * 16 * 3) },
    { width: 16, height: 16, data: new Uint8Array(1) },
  ])
    assert.equal(
      inspectAttachment(small, () => image),
      null,
    );
});
test("new wire formats are JPEG and bounded PDF signatures; no PDF parsing or safety claim", () => {
  for (const prefix of [
    [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0],
    [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
  ])
    assert.equal(inspectAttachment(new Uint8Array(prefix)), null);
  assert.deepEqual(inspectAttachment(new TextEncoder().encode("%PDF-1.7\nfixture")), {
    extension: "pdf",
    mime: "application/pdf",
  });
  assert.equal(inspectAttachment(new TextEncoder().encode("%PDF-")), null);
});
