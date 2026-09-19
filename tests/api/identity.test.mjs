import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";

const user = "00000000-0000-4000-8000-000000000001";
const partner = "00000000-0000-4000-8000-000000000002";
const home = "00000000-0000-4000-8000-000000000010";
let origin;
let handler;
let revoked = false;
const requests = [];
const server = createServer((request, response) => {
  requests.push({ url: request.url, headers: request.headers });
  const token = request.headers.authorization?.slice(7);
  response.setHeader("content-type", "application/json");
  if (token === "redirect") {
    response.writeHead(302, { Location: "/credential-sink" }).end();
    return;
  }
  if (token === "expired") {
    response.writeHead(401).end(JSON.stringify({ secret: "internal error detail" }));
    return;
  }
  if (token === "unavailable") {
    response.writeHead(500).end(JSON.stringify({ secret: "internal error detail" }));
    return;
  }
  if (request.url === "/auth/v1/user") {
    response.end(JSON.stringify(authUser(token)));
    return;
  }
  const member = {
    user_id: token === "partner" ? partner : user,
    household_id: home,
    display_name: "Member",
  };
  const cases = {
    outsider: [],
    revocable: revoked ? [] : [member],
    duplicate: [member, member],
    wronguser: [{ ...member, user_id: partner }],
    malformed: [{ ...member, household_id: "not-a-uuid" }],
  };
  response.end(JSON.stringify(cases[token] ?? [member]));
});

function authUser(token) {
  return {
    id: token === "malformedauth" ? "invalid" : token === "partner" ? partner : user,
    is_anonymous: token === "anonymous",
    user_metadata: { household_id: "attacker" },
  };
}

before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  handler = createHandler({ url: origin, publishableKey: "sb_publishable_fixture" });
});
after(() => new Promise((resolve) => server.close(resolve)));

function handle(authorization, options = {}) {
  return handler(
    new Request("http://localhost/v1/session", {
      ...options,
      headers: authorization ? { authorization } : {},
    }),
  );
}

test("missing, malformed and oversized bearer headers never reach identity services", async () => {
  const count = requests.length;
  for (const header of [
    undefined,
    "Basic abc",
    "Bearer ",
    "Bearer a b",
    `Bearer ${"a".repeat(8192)}`,
  ]) {
    assert.equal((await handle(header)).status, 401);
  }
  assert.equal(requests.length, count);
});

test("verified member identity ignores editable metadata and uses a user-scoped membership read", async () => {
  const response = await handle("Bearer member");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    version: 1,
    member: { userId: user, householdId: home, displayName: "Member" },
  });
  const query = new URL(requests.at(-1).url, origin);
  assert.equal(query.searchParams.get("user_id"), `eq.${user}`);
  assert.equal(query.searchParams.get("limit"), "2");
  assert.equal(requests.at(-1).headers.authorization, "Bearer member");
  assert.equal(requests.at(-1).headers.apikey, "sb_publishable_fixture");
});

test("concurrent partners never inherit another request's actor", async () => {
  const responses = await Promise.all([handle("Bearer member"), handle("Bearer partner")]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies[0].member.userId, user);
  assert.equal(bodies[1].member.userId, partner);
});

test("outsiders, ambiguous memberships and mismatched member IDs are denied", async () => {
  for (const token of ["outsider", "duplicate", "wronguser"]) {
    const response = await handle(`Bearer ${token}`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: { code: "not_a_member" } });
  }
});

test("anonymous identity is denied before any membership read", async () => {
  const count = requests.length;
  assert.equal((await handle("Bearer anonymous")).status, 401);
  assert.equal(requests.length, count + 1);
  assert.equal(requests.at(-1).url, "/auth/v1/user");
});

test("upstream failure and malformed data cannot be mistaken for empty membership or leak details", async () => {
  for (const [token, status, code] of [
    ["expired", 401, "unauthenticated"],
    ["unavailable", 503, "unavailable"],
    ["malformed", 503, "unavailable"],
    ["malformedauth", 503, "unavailable"],
  ]) {
    const response = await handle(`Bearer ${token}`);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
});

test("aborted requests fail closed and unsupported methods cannot run identity reads", async () => {
  const count = requests.length;
  assert.equal((await handle("Bearer member", { method: "POST" })).status, 405);
  assert.equal(requests.length, count);
  const signal = AbortSignal.abort();
  assert.equal((await handle("Bearer member", { signal })).status, 503);
  assert.equal(requests.length, count);
});

test("configuration rejects credential-bearing URLs, unsafe transport and server secret keys", () => {
  for (const url of [
    "http://remote.example",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?key=secret",
  ]) {
    assert.throws(() => createHandler({ url, publishableKey: "sb_publishable_fixture" }));
  }
  assert.throws(() => createHandler({ url: origin, publishableKey: "sb_secret_never-use" }));
});

test("membership is checked again after revocation for the same bearer token", async () => {
  assert.equal((await handle("Bearer revocable")).status, 200);
  revoked = true;
  assert.equal((await handle("Bearer revocable")).status, 403);
});

test("identity redirects are refused without forwarding bearer credentials", async () => {
  const count = requests.length;
  assert.equal((await handle("Bearer redirect")).status, 503);
  assert.equal(requests.length, count + 1);
  assert.equal(requests.at(-1).url, "/auth/v1/user");
});
