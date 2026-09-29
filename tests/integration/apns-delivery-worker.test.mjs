import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { apnsDeliveryWorker } from "../../apps/api/src/push/apns-delivery-worker.ts";
import { apnsWorkerFixture } from "./apns-worker-fixture.mjs";
import { id } from "../database/apns-delivery-fixture.mjs";

test("legacy Expo RPCs retain their ticket/receipt semantics while the APNs path refuses their devices", async (t) => {
  const f = await apnsWorkerFixture(t, () => assert.fail("No Apple dispatch for Expo enrollment"));
  const revision = f.db.sql(
    `select revision from private.nest_push_devices where installation_id='${id(1702)}'`,
  );
  f.execute(
    f.save({
      action: "register",
      operationId: id(2809),
      installationId: id(1702),
      expectedRevision: revision,
      token: "ExponentPushToken[LegacyAPNsRegression]",
    }),
  );
  const delivery = f.renewalPrepare();
  assert.equal(
    await Effect.runPromise(apnsDeliveryWorker(f.rpc, f.provider, "sandbox").send(delivery)),
    "skipped",
  );
  assert.equal(f.calls.length, 0);
  const attempt = await Effect.runPromise(f.rpc("begin", { p_delivery: delivery }));
  assert.equal(attempt.token, "ExponentPushToken[LegacyAPNsRegression]");
  assert.equal(attempt.provider, undefined);
  const sent = await Effect.runPromise(
    f.rpc("finishSend", {
      p_delivery: delivery,
      p_attempt: attempt.attemptId,
      p_result: { status: "ticket", ticketId: "legacy-apns-regression" },
    }),
  );
  assert.equal(sent.result.status, "ticket");
  const accepted = await Effect.runPromise(
    f.rpc("finishReceipt", {
      p_delivery: delivery,
      p_attempt: attempt.attemptId,
      p_ticket: "legacy-apns-regression",
      p_result: { status: "accepted" },
    }),
  );
  assert.equal(accepted.result.status, "accepted");
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "0");
});

test("an unbound provider response persists uncertainty and never produces a ticket or automatic resend", async (t) => {
  const f = await apnsWorkerFixture(t, (stream) => {
    stream.respond({ ":status": 200, "apns-id": "00000000-0000-4000-8000-000000009999" });
    stream.end();
  });
  const worker = apnsDeliveryWorker(f.rpc, f.provider, "sandbox"),
    delivery = f.renewalPrepare();
  assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded");
  assert.equal(
    f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
    "unknown",
  );
  assert.equal(f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`), "f");
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(f.calls.length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_results"), "0");
});

test("a lost begin acknowledgement preserves a one-use uncertain attempt without dispatching or reclaiming it", async (t) => {
  const f = await apnsWorkerFixture(t, () => assert.fail("No APNs stream should be sent"));
  const rpc = (method, input) =>
    f
      .rpc(method, input)
      .pipe(
        Effect.flatMap((result) =>
          method === "beginApns" && result !== null
            ? Effect.fail(new ApiFailure({ code: "unavailable" }))
            : Effect.succeed(result),
        ),
      );
  const worker = apnsDeliveryWorker(rpc, f.provider, "sandbox"),
    delivery = f.renewalPrepare();
  await assert.rejects(Effect.runPromise(worker.send(delivery)));
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "1");
  assert.equal(
    f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
    "sending",
  );
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(f.calls.length, 0);
});
test("all six authorized APNs kinds traverse real PostgreSQL/PostgREST and HTTP2 with private payloads and exact immutable acknowledgement", async (t) => {
  const f = await apnsWorkerFixture(t, (stream, headers) => {
    stream.respond({ ":status": 200, "apns-id": headers["apns-id"] });
    stream.end();
  });
  const worker = apnsDeliveryWorker(f.rpc, f.provider, "sandbox");
  const finances = f.financialState();
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  const sources = [
    [f.renewalPrepare, "renewal"],
    [f.summaryPrepare, "daily_summary"],
    [f.chorePrepare, "chore"],
    [f.mealPrepare, "meal"],
    [f.groceryPrepare, "grocery"],
    [f.prepare, "recurring"],
  ];
  for (const [prepare, kind] of sources) {
    const delivery = prepare();
    assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded", kind);
    assert.equal(
      await Effect.runPromise(worker.send(delivery)),
      "skipped",
      "same delivery never dispatches twice",
    );
    const call = f.calls.at(-1);
    assert.equal(call.body.nest.kind, kind);
    assert.equal(
      call.headers["apns-id"],
      f.db.sql(`select attempt_id from private.nest_push_deliveries where id='${delivery}'`),
    );
    assert.equal(
      f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
      "provider_accepted",
    );
    for (const secret of [
      "Private chore title",
      "Private meal title",
      "Private grocery",
      "Internet",
      "amountCentimes",
    ])
      assert.equal(JSON.stringify(call.body).includes(secret), false);
  }
  assert.equal(f.calls.length, 6);
  assert.equal(
    f.db.sql(
      "select count(*) from private.nest_push_send_results where acknowledgment->>'provider'='apns'",
    ),
    "6",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_results"), "0");
  assert.equal(
    f.financialState(),
    finances,
    "push cannot alter financial history, allocations or member ledger entries",
  );
});
test("lost database acknowledgement retries only exact outcome persistence and never external dispatch", async (t) => {
  const f = await apnsWorkerFixture(t, (stream, headers) => {
    stream.respond({ ":status": 200, "apns-id": headers["apns-id"] });
    stream.end();
  });
  let writes = 0;
  const rpc = (method, input) =>
    f.rpc(method, input).pipe(
      Effect.flatMap((result) => {
        if (method === "finishApnsSend" && ++writes === 1)
          return Effect.fail(new ApiFailure({ code: "unavailable" }));
        return Effect.succeed(result);
      }),
    );
  const worker = apnsDeliveryWorker(rpc, f.provider, "sandbox"),
    delivery = f.renewalPrepare();
  assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded");
  assert.equal(writes, 2);
  assert.equal(f.calls.length, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_push_send_results"), "1");
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(f.calls.length, 1);
});
