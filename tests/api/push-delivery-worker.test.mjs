import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
const id = "00000000-0000-4000-8000-000000000001";
const attempt = {
  version: 1,
  deliveryId: id,
  attemptId: id,
  outboxId: id,
  installationId: id,
  registrationRevision: id,
  token: "ExponentPushToken[fixture]",
  householdId: id,
  renewalId: id,
};
test("lost persistence acknowledgment retries only the immutable outcome, never the provider", async () => {
  let sends = 0,
    finishes = 0;
  const rpc = (method, input) =>
    Effect.suspend(() => {
      if (method === "begin") return Effect.succeed(attempt);
      finishes++;
      if (finishes === 1) return Effect.fail(new ApiFailure({ code: "unavailable" }));
      return Effect.succeed({ result: input.p_result, attemptId: id, deliveryId: id, version: 1 });
    });
  const worker = pushDeliveryWorker(rpc, {
    send: () =>
      Effect.sync(() => {
        sends++;
        return { status: "ticket", ticketId: "ticket" };
      }),
    receipt: () => Effect.succeed(null),
  });
  assert.equal(await Effect.runPromise(worker.send(id)), "recorded");
  assert.equal(sends, 1);
  assert.equal(finishes, 2);
});
test("missing or substituted attempts cannot dispatch a provider request", async () => {
  for (const raw of [
    null,
    { ...attempt, deliveryId: "00000000-0000-4000-8000-000000000002" },
    {},
  ]) {
    const worker = pushDeliveryWorker(() => Effect.succeed(raw), {
      send: () => {
        assert.fail("unauthorized send");
      },
      receipt: () => Effect.succeed(null),
    });
    if (raw === null) assert.equal(await Effect.runPromise(worker.send(id)), "skipped");
    else await assert.rejects(Effect.runPromise(worker.send(id)));
  }
});
test("pending receipts are not persisted; forged acknowledgments cannot report success", async () => {
  const worker = pushDeliveryWorker(
    (method) => {
      if (method === "begin") return Effect.succeed(attempt);
      return Effect.succeed({
        version: 1,
        deliveryId: id,
        attemptId: id,
        result: { status: "accepted" },
      });
    },
    { send: () => Effect.succeed({ status: "unknown" }), receipt: () => Effect.succeed(null) },
  );
  await assert.rejects(Effect.runPromise(worker.send(id)));
  assert.equal(
    await Effect.runPromise(
      worker.receipt({ version: 1, deliveryId: id, attemptId: id, ticketId: "ticket" }),
    ),
    "pending",
  );
});
