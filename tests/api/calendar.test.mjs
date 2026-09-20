import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { calendarCommands } from "../../apps/api/src/calendar/commands.ts";
import { readBusySnapshots } from "../../apps/api/src/calendar/read.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "Fixture" },
  token: "fixture",
};
const commands = calendarCommands(config, caller);
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const response = (value, range = "0-0/1") =>
  Response.json(value, { headers: { "content-range": range } });
const stamp = Date.now() - 1000;
const row = {
  actorId: id(1),
  householdId: id(10),
  schemaVersion: 1,
  consent: "1",
  generation: "2",
  capturedAt: new Date(stamp).toISOString(),
  expiresAt: new Date(stamp + 900000).toISOString(),
  coveredStart: 100,
  coveredEnd: 200,
  intervals: [{ start: 110, end: 120 }],
};
test("busy reads validate complete scoped data and fail closed on personal metadata, duplicate actors and invalid intervals", async () => {
  const invalid = [
    [[row], "0-0/2"],
    [[], "*/1"],
    [[row, row], "0-1/2"],
    ...[
      { householdId: id(20) },
      { eventTitle: "private" },
      { generation: 2 },
      { consent: "0" },
      { coveredStart: -1 },
      { coveredEnd: 2678400101 },
      { intervals: [{ start: 110, end: 120, title: "private" }] },
      {
        intervals: [
          { start: 110, end: 120 },
          { start: 120, end: 125 },
        ],
      },
      { intervals: [{ start: 99, end: 110 }] },
      { expiresAt: new Date(stamp + 900001).toISOString() },
    ].map((patch) => [[{ ...row, ...patch }], "0-0/1"]),
  ];
  for (const [rows, range] of invalid)
    await assert.rejects(
      run(readBusySnapshots(config, caller), async () => response(rows, range)),
      { code: "unavailable" },
    );
  const result = await run(readBusySnapshots(config, caller), async (url) => {
    assert.equal(new URL(url).searchParams.get("household_id"), `eq.${id(10)}`);
    return response([row]);
  });
  assert.deepEqual(result.snapshots[0].covered, { start: 100, end: 200 });
  assert.equal(result.snapshots[0].householdId, undefined);
});
test("busy reads drop expired and future captures without interpreting missing snapshots as free", async () => {
  for (const capturedAt of [Date.now() - 900001, Date.now() + 900000]) {
    const raw = {
      ...row,
      capturedAt: new Date(capturedAt).toISOString(),
      expiresAt: new Date(capturedAt + 900000).toISOString(),
    };
    assert.deepEqual(
      (await run(readBusySnapshots(config, caller), async () => response([raw]))).snapshots,
      [],
    );
  }
  assert.deepEqual(
    (await run(readBusySnapshots(config, caller), async () => response([], "*/0"))).snapshots,
    [],
  );
});
test("calendar commands reject forged owner or private fields before any RPC", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return response(null);
  };
  for (const input of [
    {
      incarnation: id(100),
      operationId: id(101),
      expectedRevision: "0",
      enabled: true,
      actorId: id(2),
    },
    { incarnation: id(100), operationId: id(101), expectedRevision: 0, enabled: true },
    { incarnation: id(100), operationId: id(101), expectedRevision: "0", enabled: "true" },
  ])
    await assert.rejects(run(commands.setConsent(input), fetch), { code: "invalid_request" });
  await assert.rejects(run(commands.begin({ incarnation: id(100), consent: "0" }), fetch), {
    code: "invalid_request",
  });
  await assert.rejects(
    run(
      commands.publish({
        incarnation: id(100),
        consent: "1",
        generation: "1",
        covered: { start: 0, end: 1 },
        intervals: [],
        calendarIds: ["private"],
      }),
      fetch,
    ),
    { code: "invalid_request" },
  );
  assert.equal(calls, 0);
});
test("consent acknowledgment verifies the exact revision and capture verifies membership lifetime and consent", async () => {
  const input = {
    incarnation: id(100),
    operationId: id(101),
    expectedRevision: "0",
    enabled: true,
  };
  for (const raw of [1, "2", null])
    await assert.rejects(
      run(commands.setConsent(input), async () => response(raw)),
      { code: "unavailable" },
    );
  const receipt = await run(commands.setConsent(input), async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), {
      p_household: id(10),
      p_incarnation: id(100),
      p_operation: id(101),
      p_expected: "0",
      p_enabled: true,
    });
    return response("1");
  });
  assert.equal(receipt.actorId, id(1));
  assert.equal(receipt.consent.enabled, true);
  const capture = {
    incarnation: id(100),
    consent: "1",
    generation: "1",
    capturedAt: row.capturedAt,
    expiresAt: row.expiresAt,
  };
  for (const patch of [
    { incarnation: id(102) },
    { consent: "2" },
    { generation: "0" },
    { expiresAt: row.capturedAt },
  ])
    await assert.rejects(
      run(commands.begin({ incarnation: id(100), consent: "1" }), async () =>
        response({ ...capture, ...patch }),
      ),
      { code: "unavailable" },
    );
  assert.deepEqual(
    (
      await run(commands.begin({ incarnation: id(100), consent: "1" }), async () =>
        response(capture),
      )
    ).capture,
    capture,
  );
});
