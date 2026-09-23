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

test("summary attempts use the generic summary transport and reject mixed or substituted sources", async () => {
  const { renewalId: _renewal, ...shared } = attempt;
  const summary = { ...shared, summaryId: id, recipientId: id };
  let sends = 0;
  const provider = {
    send: () => {
      assert.fail("wrong source transport");
    },
    sendSummary: () =>
      Effect.sync(() => {
        sends++;
        return { status: "unknown" };
      }),
    receipt: () => Effect.succeed(null),
  };
  const worker = pushDeliveryWorker(
    (method, input) =>
      Effect.succeed(
        method === "begin"
          ? summary
          : { version: 1, deliveryId: id, attemptId: id, result: input.p_result },
      ),
    provider,
  );
  assert.equal(await Effect.runPromise(worker.send(id)), "recorded");
  assert.equal(sends, 1);
  for (const invalid of [
    { ...summary, renewalId: id },
    { ...summary, outboxId: "00000000-0000-4000-8000-000000000002" },
  ]) {
    const bad = pushDeliveryWorker(() => Effect.succeed(invalid), provider);
    await assert.rejects(Effect.runPromise(bad.send(id)));
  }
  assert.equal(sends, 1);
});

test("chore attempts dispatch once and reject mixed identities before provider execution", async () => {
  const { renewalId: _renewal, ...shared } = attempt;
  const chore = { ...shared, occurrenceId: id };
  let sends = 0;
  const provider = {
    send: () => assert.fail("wrong renewal transport"),
    sendSummary: () => assert.fail("wrong summary transport"),
    sendChore: (value) =>
      Effect.sync(() => {
        assert.deepEqual(value, chore);
        sends++;
        return { status: "unknown" };
      }),
    receipt: () => Effect.succeed(null),
  };
  const rpc = (method, input) =>
    Effect.succeed(
      method === "begin"
        ? chore
        : { version: 1, deliveryId: id, attemptId: id, result: input.p_result },
    );
  assert.equal(await Effect.runPromise(pushDeliveryWorker(rpc, provider).send(id)), "recorded");
  for (const raw of [
    { ...chore, renewalId: id },
    { ...chore, summaryId: id, recipientId: id },
    { ...chore, occurrenceId: "bad" },
    { ...chore, title: "Private" },
  ]) {
    await assert.rejects(
      Effect.runPromise(pushDeliveryWorker(() => Effect.succeed(raw), provider).send(id)),
    );
  }
  assert.equal(sends, 1);
});

test("meal attempts dispatch once and reject mixed identities before provider execution", async () => {
  const { renewalId: _renewal, ...shared } = attempt;
  const meal = { ...shared, entryId: id };
  let sends = 0;
  const provider = {
    send: () => assert.fail("wrong renewal transport"),
    sendSummary: () => assert.fail("wrong summary transport"),
    sendMeal: (value) =>
      Effect.sync(() => {
        assert.deepEqual(value, meal);
        sends++;
        return { status: "unknown" };
      }),
    receipt: () => Effect.succeed(null),
  };
  const rpc = (method, input) =>
    Effect.succeed(
      method === "begin"
        ? meal
        : { version: 1, deliveryId: id, attemptId: id, result: input.p_result },
    );
  assert.equal(await Effect.runPromise(pushDeliveryWorker(rpc, provider).send(id)), "recorded");
  for (const raw of [
    { ...meal, renewalId: id },
    { ...meal, occurrenceId: id },
    { ...meal, summaryId: id, recipientId: id },
    { ...meal, entryId: "bad" },
    { ...meal, title: "Private" },
  ]) {
    await assert.rejects(
      Effect.runPromise(pushDeliveryWorker(() => Effect.succeed(raw), provider).send(id)),
    );
  }
  assert.equal(sends, 1);
});

test("grocery attempts dispatch once and reject mixed identities before provider execution", async () => {
  const { renewalId: _renewal, ...shared } = attempt;
  const grocery = { ...shared, itemId: id };
  let sends = 0;
  const provider = {
    send: () => assert.fail("wrong renewal transport"),
    sendSummary: () => assert.fail("wrong summary transport"),
    sendGrocery: (value) =>
      Effect.sync(() => {
        assert.deepEqual(value, grocery);
        sends++;
        return { status: "unknown" };
      }),
    receipt: () => Effect.succeed(null),
  };
  const rpc = (method, input) =>
    Effect.succeed(
      method === "begin"
        ? grocery
        : { version: 1, deliveryId: id, attemptId: id, result: input.p_result },
    );
  assert.equal(await Effect.runPromise(pushDeliveryWorker(rpc, provider).send(id)), "recorded");
  for (const raw of [
    { ...grocery, renewalId: id },
    { ...grocery, entryId: id },
    { ...grocery, occurrenceId: id },
    { ...grocery, summaryId: id, recipientId: id },
    { ...grocery, itemId: "bad" },
    { ...grocery, title: "Private" },
  ]) {
    await assert.rejects(
      Effect.runPromise(pushDeliveryWorker(() => Effect.succeed(raw), provider).send(id)),
    );
  }
  assert.equal(sends, 1);
});

test("recurring attempts dispatch once and reject mixed identities before provider execution", async () => {
  const { renewalId: _renewal, ...shared } = attempt;
  const recurring = { ...shared, ruleId: id };
  let sends = 0;
  const provider = {
    send: () => assert.fail("wrong renewal transport"),
    sendSummary: () => assert.fail("wrong summary transport"),
    sendRecurring: (value) =>
      Effect.sync(() => {
        assert.deepEqual(value, recurring);
        sends++;
        return { status: "unknown" };
      }),
    receipt: () => Effect.succeed(null),
  };
  const rpc = (method, input) =>
    Effect.succeed(
      method === "begin"
        ? recurring
        : { version: 1, deliveryId: id, attemptId: id, result: input.p_result },
    );
  assert.equal(await Effect.runPromise(pushDeliveryWorker(rpc, provider).send(id)), "recorded");
  for (const raw of [
    { ...recurring, renewalId: id },
    { ...recurring, entryId: id },
    { ...recurring, itemId: id },
    { ...recurring, occurrenceId: id },
    { ...recurring, summaryId: id, recipientId: id },
    { ...recurring, ruleId: "bad" },
    { ...recurring, title: "Private" },
  ]) {
    await assert.rejects(
      Effect.runPromise(pushDeliveryWorker(() => Effect.succeed(raw), provider).send(id)),
    );
  }
  assert.equal(sends, 1);
});
