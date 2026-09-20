import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { calendarClient } from "../src/calendar/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const client = calendarClient(
  "http://localhost/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (effect, value) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value))),
  );
const owner = { version: 1, actorId: id(1), householdId: id(10) };
const consent = { incarnation: id(100), version: "1", enabled: true };
test("calendar client binds consent acknowledgments to exact owner, operation, incarnation, revision and choice", async () => {
  const input = {
    incarnation: id(100),
    operationId: id(101),
    expectedRevision: "0",
    enabled: true,
  };
  const receipt = { ...owner, operationId: id(101), consent };
  assert.deepEqual(await run(client.setConsent(input), receipt), consent);
  const patches = [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(102) },
    ...[{ incarnation: id(102) }, { version: "2" }, { enabled: false }].map((patch) => ({
      consent: { ...consent, ...patch },
    })),
  ];
  for (const patch of patches)
    await assert.rejects(run(client.setConsent(input), { ...receipt, ...patch }), {
      code: "unavailable",
    });
});
test("calendar client prevents swapped capture/publication receipts and cross-household availability", async () => {
  const input = { incarnation: id(100), consent: "1" };
  const capture = {
    ...input,
    generation: "1",
    capturedAt: "2026-09-20T00:00:00Z",
    expiresAt: "2026-09-20T00:15:00Z",
  };
  assert.deepEqual(await run(client.begin(input), { ...owner, capture }), capture);
  for (const patch of [{ incarnation: id(102) }, { consent: "2" }])
    await assert.rejects(
      run(client.begin(input), { ...owner, capture: { ...capture, ...patch } }),
      { code: "unavailable" },
    );
  const publication = { ...input, generation: "1", covered: { start: 0, end: 100 }, intervals: [] };
  const receipt = { ...owner, ...input, generation: "1", expiresAt: capture.expiresAt };
  for (const patch of [
    { actorId: id(2) },
    { incarnation: id(102) },
    { consent: "2" },
    { generation: "2" },
  ])
    await assert.rejects(run(client.publish(publication), { ...receipt, ...patch }), {
      code: "unavailable",
    });
  await assert.rejects(
    run(client.snapshots(), { version: 1, householdId: id(20), snapshots: [] }),
    { code: "unavailable" },
  );
});
test("calendar client rejects changed account before HTTP dispatch", async () => {
  let calls = 0;
  const changed = calendarClient(
    "http://localhost/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "wrong-account" }),
  );
  await assert.rejects(
    Effect.runPromise(
      changed.consent().pipe(
        Effect.provideService(FetchHttpClient.Fetch, async () => {
          calls++;
          return Response.json({});
        }),
      ),
    ),
    { code: "session" },
  );
  assert.equal(calls, 0);
});
