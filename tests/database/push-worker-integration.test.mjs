import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { deliveryFixture, json } from "./push-delivery-fixture.mjs";
function setup(t, lostMethod) {
  const f = deliveryFixture(t);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923003827_native_push_receipt_polling",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  let lost = false;
  const rpc = (method, p) =>
    Effect.try({
      try: () => {
        const suffix =
          method === "begin"
            ? `begin_push_delivery('${p.p_delivery}')`
            : method === "finishSend"
              ? `finish_push_send('${p.p_delivery}','${p.p_attempt}',${json(p.p_result)})`
              : `finish_push_receipt('${p.p_delivery}','${p.p_attempt}','${p.p_ticket}',${json(p.p_result)})`;
        const value = f.db.sql(`select private.nest_${suffix}`);
        if (!lost && method === lostMethod) {
          lost = true;
          throw new Error("Lost committed response");
        }
        return value ? JSON.parse(value) : null;
      },
      catch: () => new ApiFailure({ code: "unavailable" }),
    });
  return { ...f, rpc };
}
test("real push journal recovers lost ticket acknowledgment without a duplicate Expo send", async (t) => {
  const f = setup(t, "finishSend"),
    delivery = f.prepare();
  let sends = 0;
  const provider = expoPushTransport(undefined, async (url) => {
    if (url.endsWith("/send")) {
      sends++;
      return Response.json({ data: { status: "ok", id: "ticket-real" } });
    }
    return Response.json({ data: { "ticket-real": { status: "ok" } } });
  });
  const worker = pushDeliveryWorker(f.rpc, provider);
  assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded");
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(sends, 1);
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const { claims } = JSON.parse(f.db.sql("select private.nest_claim_push_receipt_polls()"));
  assert.equal(await Effect.runPromise(worker.receipt(claims[0])), "recorded");
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "accepted");
  assert.equal(f.db.sql("select count(*) from private.nest_push_send_results"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_results"), "1");
});
test("a lost authorized begin cannot be reacquired or trigger a provider call", async (t) => {
  const f = setup(t, "begin"),
    delivery = f.prepare();
  const worker = pushDeliveryWorker(
    f.rpc,
    expoPushTransport(undefined, async () => assert.fail("unexpected provider call")),
  );
  await assert.rejects(Effect.runPromise(worker.send(delivery)));
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "sending");
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "1");
});
test("an uncertain provider response is retained without retry permission", async (t) => {
  const f = setup(t),
    delivery = f.prepare();
  let calls = 0;
  const worker = pushDeliveryWorker(
    f.rpc,
    expoPushTransport(undefined, async () => {
      calls++;
      throw new Error("lost network response");
    }),
  );
  assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded");
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(calls, 1);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "unknown");
  assert.equal(f.db.sql(`select private.nest_retry_push_delivery('${delivery}')`), "f");
});
