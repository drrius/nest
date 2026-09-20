import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const files = [
  "tests/database/busy-fixture.sql",
  "tests/integration/food-postgrest.sql",
  "supabase/migrations/20260919214955_native_busy_snapshots.sql",
];
function client(f, bearer = f.bearer) {
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  return async (path, input) =>
    handler(
      new Request(`http://localhost/v1/calendar/${path}`, {
        method: input === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "x-nest-household": id(10),
          "content-type": "application/json",
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
    );
}
async function enable(c) {
  const consent = (await (await c("consent")).json()).consent;
  const response = await c("consent/set", {
    incarnation: consent.incarnation,
    operationId: id(100),
    expectedRevision: consent.version,
    enabled: true,
  });
  assert.equal(response.status, 200);
  return (await response.json()).consent;
}
async function capture(c, consent) {
  const response = await c("capture", {
    incarnation: consent.incarnation,
    consent: consent.version,
  });
  assert.equal(response.status, 200);
  return (await response.json()).capture;
}
const publication = (capture) => ({
  incarnation: capture.incarnation,
  consent: capture.consent,
  generation: capture.generation,
  covered: { start: 1800000000000, end: 1800086400000 },
  intervals: [{ start: 1800000001000, end: 1800000002000 }],
});
test("calendar API starts disabled, shares only sanitized fresh ranges, and opt-out removes partner access", async (t) => {
  const f = await postgrestFixture(t, files),
    c = client(f),
    partner = client(f, f.partnerBearer);
  const initial = await c("consent");
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.equal((await initial.json()).consent.enabled, false);
  assert.deepEqual((await (await partner("busy")).json()).snapshots, []);
  const consent = await enable(c),
    claim = await capture(c, consent),
    input = publication(claim);
  assert.equal((await c("publish", input)).status, 200);
  const shared = (await (await partner("busy")).json()).snapshots;
  assert.equal(shared.length, 1);
  assert.equal(shared[0].actorId, id(1));
  assert.deepEqual(shared[0].intervals, input.intervals);
  assert.deepEqual(
    Object.keys(shared[0]).sort(),
    [
      "actorId",
      "schemaVersion",
      "consent",
      "generation",
      "capturedAt",
      "expiresAt",
      "covered",
      "intervals",
    ].sort(),
  );
  assert.equal((await (await partner("consent")).json()).consent.enabled, false);
  assert.equal(
    (
      await c("consent/set", {
        incarnation: consent.incarnation,
        operationId: id(101),
        expectedRevision: consent.version,
        enabled: false,
      })
    ).status,
    200,
  );
  assert.deepEqual((await (await partner("busy")).json()).snapshots, []);
  assert.equal((await c("publish", input)).status, 409);
  assert.equal((await client(f, f.otherBearer)("busy")).status, 403);
});
test("calendar publication rejects nested personal metadata and consent forgery before storing anything", async (t) => {
  const f = await postgrestFixture(t, files),
    c = client(f);
  const input = publication(await capture(c, await enable(c)));
  for (const patch of [
    { actorId: id(2) },
    { calendarId: "private" },
    { eventTitle: "Secret" },
    { intervals: [{ ...input.intervals[0], title: "Secret" }] },
    { covered: { ...input.covered, title: "Secret" } },
    { intervals: [{ start: input.covered.start - 1, end: input.covered.end }] },
    { intervals: [{ start: 1.5, end: 2 }] },
    { generation: 1 },
    { covered: { start: 0, end: 2678400001 } },
  ])
    assert.equal((await c("publish", { ...input, ...patch })).status, 400);
  assert.equal(f.db.sql("select count(*) from public.nest_busy_snapshots"), "0");
  assert.equal((await c("publish", { ...input, intervals: [] })).status, 200);
});
test("lost consent and publication acknowledgments replay safely, while superseded capture and membership fail closed", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_set_calendar_consent");
  const c = client({ ...f, url: proxy.url });
  const consent = (await (await c("consent")).json()).consent;
  const command = {
    incarnation: consent.incarnation,
    operationId: id(100),
    expectedRevision: "0",
    enabled: true,
  };
  assert.equal((await c("consent/set", command)).status, 503);
  assert.equal((await c("consent/set", command)).status, 200);
  const active = { ...consent, version: "1", enabled: true };
  const old = publication(await capture(c, active));
  const fresh = publication(await capture(c, active));
  assert.equal((await c("publish", old)).status, 409);
  const lost = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_publish_busy"),
    publisher = client({ ...f, url: lost.url });
  assert.equal((await publisher("publish", fresh)).status, 503);
  assert.equal((await publisher("publish", fresh)).status, 200);
  assert.equal((await publisher("publish", { ...fresh, intervals: [] })).status, 400);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await c("consent")).status, 403);
  assert.equal((await publisher("publish", fresh)).status, 403);
  assert.deepEqual((await (await client(f, f.partnerBearer)("busy")).json()).snapshots, []);
});
test("expired snapshots never imply free availability and old membership identities cannot re-enable sharing", async (t) => {
  const f = await postgrestFixture(t, files),
    c = client(f);
  const consent = await enable(c),
    input = publication(await capture(c, consent));
  assert.equal((await c("publish", input)).status, 200);
  f.db.sql(
    "update public.nest_busy_snapshots set expires_at=clock_timestamp()-interval '1 second'",
  );
  assert.deepEqual((await (await client(f, f.partnerBearer)("busy")).json()).snapshots, []);
  f.db.sql(
    `delete from public.household_members where user_id='${id(1)}'; insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','Restored')`,
  );
  const restored = (await (await c("consent")).json()).consent;
  assert.notEqual(restored.incarnation, consent.incarnation);
  assert.equal(restored.enabled, false);
  assert.equal(
    (
      await c("consent/set", {
        incarnation: consent.incarnation,
        operationId: id(200),
        expectedRevision: "0",
        enabled: true,
      })
    ).status,
    409,
  );
});

test("calendar publication accepts the complete 512-interval boundary and rejects overflow before replacing it", async (t) => {
  const f = await postgrestFixture(t, files),
    c = client(f);
  const consent = await enable(c);
  const input = {
    ...publication(await capture(c, consent)),
    intervals: Array.from({ length: 512 }, (_, index) => ({
      start: 1800000000000 + index * 3,
      end: 1800000000001 + index * 3,
    })),
  };
  assert.equal((await c("publish", input)).status, 200);
  const next = {
    ...input,
    ...publication(await capture(c, consent)),
    intervals: [...input.intervals, { start: 1800000001600, end: 1800000001601 }],
  };
  assert.equal((await c("publish", next)).status, 400);
  const shared = (await (await client(f, f.partnerBearer)("busy")).json()).snapshots;
  assert.deepEqual(shared[0].intervals, input.intervals);
});
