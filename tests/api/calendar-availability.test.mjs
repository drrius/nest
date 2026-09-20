import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readAvailability } from "../../apps/api/src/calendar/availability.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const member = { userId: id(1), householdId: id(10), displayName: "First" };
const partner = { ...member, userId: id(2), displayName: "Second" };
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = { member, token: "fixture" };
const query = { start: 100, end: 200 };
const run = (fetch, input = query) =>
  Effect.runPromise(
    readAvailability(config, caller, input).pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );
const response = (rows, range) => Response.json(rows, { headers: { "content-range": range } });
test("availability rejects incomplete, duplicate, foreign or caller-excluding rosters", async () => {
  for (const [rows, range] of [
    [[member], "0-0/2"],
    [[member, member], "0-1/2"],
    [[member, { ...partner, householdId: id(20) }], "0-1/2"],
    [[partner], "0-0/1"],
    [[], "*/0"],
  ])
    await assert.rejects(
      run(async () => response(rows, range)),
      { code: "unavailable" },
    );
});
test("missing shared evidence explicitly returns unknown for every current household member", async () => {
  const result = await run(async (url) =>
    new URL(url).pathname.endsWith("household_members")
      ? response([member, partner], "0-1/2")
      : response([], "*/0"),
  );
  assert.deepEqual(result.members, [
    { actorId: id(1), displayName: "First", status: "unknown" },
    { actorId: id(2), displayName: "Second", status: "unknown" },
  ]);
  assert.deepEqual(result.query, query);
});
test("availability rejects personal metadata and malformed ranges before any backend read", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return response([], "*/0");
  };
  for (const input of [
    { ...query, calendarId: "secret" },
    { ...query, actorId: id(2) },
    { start: 100, end: 100 },
    { start: -1, end: 1 },
    { start: 0, end: 2678400001 },
    { start: "100", end: 200 },
  ])
    await assert.rejects(run(fetch, input), { code: "invalid_request" });
  assert.equal(calls, 0);
});
test("a snapshot attributed to an actor absent from the current roster fails closed", async () => {
  const now = Date.now();
  const snapshot = {
    actorId: id(3),
    householdId: id(10),
    schemaVersion: 1,
    consent: "1",
    generation: "1",
    capturedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 900000).toISOString(),
    coveredStart: 0,
    coveredEnd: 1000,
    intervals: [],
  };
  await assert.rejects(
    run(async (url) =>
      new URL(url).pathname.endsWith("household_members")
        ? response([member, partner], "0-1/2")
        : response([snapshot], "0-0/1"),
    ),
    { code: "unavailable" },
  );
});
