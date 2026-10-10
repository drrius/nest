import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { apnsDeliveryWorker } from "../../apps/api/src/push/apns-delivery-worker.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const attempt = {
  version: 1,
  provider: "apns",
  environment: "sandbox",
  token: "a1b2",
  deliveryId: id(1),
  attemptId: id(2),
  apnsId: id(2),
  outboxId: id(3),
  installationId: id(4),
  registrationRevision: id(5),
  householdId: id(6),
  renewalId: id(7),
};
const result = { status: "provider_accepted", apnsId: id(2) };
const ack = { version: 1, provider: "apns", deliveryId: id(1), attemptId: id(2), result };
test("wrong-provider/environment/identity/private or multi-target claims cannot dispatch", async () => {
  let calls = 0,
    writes = 0;
  const provider = {
    send: () =>
      Effect.sync(() => {
        calls++;
        return result;
      }),
  };
  for (const patch of [
    { provider: "expo" },
    { environment: "production" },
    { token: "AABB" },
    { apnsId: id(99) },
    { deliveryId: id(99) },
    { ruleId: id(8) },
    { title: "Private title" },
    { recipientId: id(8) },
    { registrationRevision: "invalid" },
    { actorId: id(8) },
  ]) {
    const rpc = (method) =>
      Effect.sync(() => {
        if (method === "beginApns") return { ...attempt, ...patch };
        writes++;
        return ack;
      });
    await assert.rejects(
      Effect.runPromise(apnsDeliveryWorker(rpc, provider, "sandbox").send(id(1))),
    );
  }
  assert.equal(calls, 0);
  assert.equal(writes, 0);
});
test("provider response and durable acknowledgement bind the exact attempt and outcome", async () => {
  const rpc = (method) => Effect.succeed(method === "beginApns" ? attempt : ack);
  let writes = 0;
  const wrongRpc = (method) =>
    Effect.sync(() => {
      if (method === "beginApns") return attempt;
      writes++;
      return ack;
    });
  await assert.rejects(
    Effect.runPromise(
      apnsDeliveryWorker(
        wrongRpc,
        { send: () => Effect.succeed({ ...result, apnsId: id(99) }) },
        "sandbox",
      ).send(id(1)),
    ),
  );
  assert.equal(writes, 0);
  for (const patch of [
    { provider: "expo" },
    { deliveryId: id(99) },
    { attemptId: id(99) },
    { result: { status: "unknown" } },
    { result: { ...result, apnsId: id(99) } },
    { token: "Private" },
  ]) {
    let calls = 0;
    const mismatched = (method) =>
      method === "beginApns" ? rpc(method) : Effect.succeed({ ...ack, ...patch });
    const provider = {
      send: () =>
        Effect.sync(() => {
          calls++;
          return result;
        }),
    };
    await assert.rejects(
      Effect.runPromise(apnsDeliveryWorker(mismatched, provider, "sandbox").send(id(1))),
    );
    assert.equal(calls, 1);
  }
});
test("only unavailable database persistence is retried, with three writes and one external send at most", async () => {
  for (const code of ["unavailable", "conflict", "forbidden"]) {
    let writes = 0,
      sends = 0,
      begins = 0;
    const rpc = (method) =>
      Effect.suspend(() => {
        if (method === "beginApns") {
          begins++;
          return Effect.succeed(attempt);
        }
        writes++;
        return Effect.fail(new ApiFailure({ code }));
      });
    const provider = {
      send: () =>
        Effect.sync(() => {
          sends++;
          return result;
        }),
    };
    await assert.rejects(
      Effect.runPromise(apnsDeliveryWorker(rpc, provider, "sandbox").send(id(1))),
    );
    assert.equal(writes, code === "unavailable" ? 3 : 1);
    assert.equal(sends, 1);
    assert.equal(begins, 1);
  }
});
