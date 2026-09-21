import assert from "node:assert/strict";
import * as Redacted from "effect/Redacted";
import { createReceiptUploadHandler } from "../src/handler.ts";
export const home = "00000000-0000-4000-8000-000000000010",
  actor = "00000000-0000-4000-8000-000000000001",
  uploadId = "00000000-0000-4000-8000-000000000100";
export const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
export const request = (bytes = pdf, query = `uploadId=${uploadId}`, token = "member-token") =>
  new Request(`https://edge.example/upload?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-nest-household": home,
      "content-type": "image/jpeg",
    },
    body: bytes,
  });
export function fixture(t) {
  const state = {
    membershipHome: home,
    writes: 0,
    reads: 0,
    reserves: 0,
    anonymous: false,
    denied: false,
    lost: false,
    writeFails: false,
    wrongResponse: false,
    wrongMime: false,
    object: null,
    intent: null,
  };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname,
      headers = new Headers(init.headers);
    assert.equal(new URL(url).origin, "https://backend.example");
    assert.equal(init.redirect, "error");
    calls.push({ path, method: init.method ?? "GET", headers });
    if (path === "/storage/v1/object/household-files/" + state.intent?.path)
      return store(state, init, headers);
    assert.equal(headers.get("authorization"), "Bearer member-token");
    assert.equal(headers.get("apikey"), "sb_publishable_fixture");
    if (path === "/auth/v1/user")
      return Response.json({ id: actor, is_anonymous: state.anonymous });
    if (path === "/rest/v1/household_members")
      return Response.json([{ user_id: actor, household_id: state.membershipHome }]);
    if (path === "/rest/v1/rpc/nest_reserve_receipt_upload") return reserve(state, init);
    if (path.startsWith("/storage/v1/object/authenticated/household-files/")) {
      state.reads++;
      if (state.denied) return new Response(null, { status: 403 });
      assert.equal(path, `/storage/v1/object/authenticated/household-files/${state.intent.path}`);
      return new Response(state.object, {
        headers: { "content-type": state.wrongMime ? "text/html" : state.intent.contentType },
      });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  const handler = createReceiptUploadHandler({
    url: "https://backend.example/",
    publishableKey: "sb_publishable_fixture",
    credential: Redacted.make("server-secret"),
  });
  return { handler, state, calls };
}
function store(state, init, headers) {
  assert.equal(headers.get("authorization"), "Bearer server-secret");
  assert.equal(headers.get("apikey"), "server-secret");
  assert.equal(headers.get("x-upsert"), "false");
  assert.equal(headers.get("content-type"), state.intent.contentType);
  assert.equal(init.method, "POST");
  state.writes++;
  if (state.writeFails) return new Response(null, { status: 503 });
  if (state.object) return new Response(null, { status: 409 });
  state.object = new Uint8Array(init.body);
  if (state.lost) throw new Error("lost upload acknowledgement");
  return Response.json({ Key: state.intent.path });
}
function reserve(state, init) {
  state.reserves++;
  if (state.denied) return new Response(null, { status: 403 });
  const { p_household, p_input } = JSON.parse(init.body);
  assert.equal(p_household, home);
  const path = `${home}/receipts/${p_input.uploadId}.${p_input.contentType === "image/jpeg" ? "jpg" : "pdf"}`;
  const value = {
    ...p_input,
    version: 1,
    householdId: home,
    uploaderId: actor,
    path,
    stored: false,
  };
  if (state.intent && JSON.stringify({ ...state.intent, stored: false }) !== JSON.stringify(value))
    return new Response(null, { status: 409 });
  state.intent ??= value;
  return Response.json({
    ...state.intent,
    stored: state.object !== null,
    ...(state.wrongResponse ? { uploaderId: home } : {}),
  });
}
