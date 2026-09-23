import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { runPushPage } from "../../apps/api/src/push/sweep.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cursor = { dueAt: "2026-09-23T00:00:00+00:00", outboxId: id(1), installationId: id(2) };
test("one failed delivery cannot stop its page, and only token-free outcomes are returned", async () => {
  const calls = [];
  const page = {
    version: 1,
    scanned: 100,
    deliveries: [id(1), id(2)],
    after: cursor,
    complete: false,
  };
  const result = await Effect.runPromise(
    runPushPage(
      () => Effect.succeed(page),
      {
        send: (deliveryId) =>
          Effect.suspend(() => {
            calls.push(deliveryId);
            return deliveryId === id(1)
              ? Effect.fail(new ApiFailure({ code: "unavailable" }))
              : Effect.succeed("recorded");
          }),
      },
      null,
    ),
  );
  assert.deepEqual(calls, [id(1), id(2)]);
  assert.deepEqual(result, {
    scanned: 100,
    after: cursor,
    complete: false,
    outcomes: [
      { deliveryId: id(1), status: "failed" },
      { deliveryId: id(2), status: "recorded" },
    ],
  });
});
test("malformed pages cannot dispatch, and failed scans cannot invent a checkpoint", async () => {
  const worker = { send: () => assert.fail("unexpected send") };
  for (const page of [
    { version: 1, scanned: 1, deliveries: [id(1), id(1)], after: null, complete: true },
    { version: 1, scanned: 99, deliveries: [], after: cursor, complete: false },
    { version: 1, scanned: 100, deliveries: [], after: null, complete: true },
  ])
    await assert.rejects(Effect.runPromise(runPushPage(() => Effect.succeed(page), worker, null)));
  await assert.rejects(
    Effect.runPromise(
      runPushPage(() => Effect.fail(new ApiFailure({ code: "unavailable" })), worker, cursor),
    ),
  );
  await assert.rejects(
    Effect.runPromise(
      runPushPage(
        () =>
          Effect.succeed({
            version: 1,
            scanned: 100,
            deliveries: [],
            after: cursor,
            complete: false,
          }),
        worker,
        cursor,
      ),
    ),
  );
});
test("the exact continuation is forwarded and an empty final page ends the sweep", async () => {
  const result = await Effect.runPromise(
    runPushPage(
      (method, input) => {
        assert.equal(method, "scan");
        assert.deepEqual(input, {
          p_due: cursor.dueAt,
          p_outbox: cursor.outboxId,
          p_installation: cursor.installationId,
        });
        return Effect.succeed({
          version: 1,
          scanned: 0,
          deliveries: [],
          after: null,
          complete: true,
        });
      },
      { send: () => assert.fail("empty page") },
      cursor,
    ),
  );
  assert.deepEqual(result, { scanned: 0, after: null, complete: true, outcomes: [] });
});

test("continuations reject backward and semantically identical cursors, retaining microsecond order", async () => {
  const prior = { ...cursor, dueAt: "2026-09-23T10:00:00.000002+00:00" };
  const worker = { send: () => assert.fail("invalid continuation dispatch") };
  for (const dueAt of [
    "2027-02-30T00:00:00Z",
    "2026-09-23T09:00:00Z",
    "2026-09-23T12:00:00.000002+02:00",
    "2026-09-23T10:00:00.000001Z",
  ]) {
    await assert.rejects(
      Effect.runPromise(
        runPushPage(
          () =>
            Effect.succeed({
              version: 1,
              scanned: 100,
              deliveries: [],
              after: { ...prior, dueAt },
              complete: false,
            }),
          worker,
          prior,
        ),
      ),
    );
  }
  const next = { ...prior, dueAt: "2026-09-23T10:00:00.000003Z" };
  const result = await Effect.runPromise(
    runPushPage(
      () =>
        Effect.succeed({
          version: 1,
          scanned: 100,
          deliveries: [],
          after: next,
          complete: false,
        }),
      worker,
      prior,
    ),
  );
  assert.deepEqual(result.after, next);
});
