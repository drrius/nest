import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { deliveryFixture } from "../database/push-delivery-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
import { runPushReceipts } from "../../apps/api/src/push/receipt-sweep.ts";
import { runPushPage } from "../../apps/api/src/push/sweep.ts";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";

test("server worker traverses HTTP/PostgREST, records tickets and receipts, and denies caller credentials", async (t) => {
  const f = deliveryFixture(t);
  for (const name of [
    "20260923002812_native_push_delivery_outcomes",
    "20260923003328_native_push_delivery_retries",
    "20260923003827_native_push_receipt_polling",
    "20260923005427_native_push_worker_rpc",
    "20260923005723_native_push_delivery_scan",
  ])
    f.db.file(`supabase/migrations/${name}.sql`);
  const http = await postgrestFixture(t, [], f.db);
  const config = { url: http.url, publishableKey: "sb_publishable_fixture" };
  const rpc = pushWorkerRpc(config, Redacted.make(http.serverKey));
  let sends = 0;
  const worker = pushDeliveryWorker(
    rpc,
    expoPushTransport(undefined, async (url) => {
      if (url.endsWith("/send")) {
        sends++;
        return Response.json({ data: { status: "ok", id: "http-ticket" } });
      }
      return Response.json({ data: { "http-ticket": { status: "ok" } } });
    }),
  );
  const page = await Effect.runPromise(rpc("scan", {}));
  assert.equal(page.scanned, 1);
  assert.equal(page.complete, true);
  const [delivery] = page.deliveries;
  const sweep = await Effect.runPromise(runPushPage(rpc, worker, null));
  assert.deepEqual(sweep.outcomes, [{ deliveryId: delivery, status: "recorded" }]);
  assert.equal(sweep.complete, true);
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(sends, 1);
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const receipts = await Effect.runPromise(runPushReceipts(rpc, worker));
  assert.equal(receipts.scanned, 1);
  assert.equal(receipts.outcomes[0].status, "recorded");
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "accepted");
  assert.throws(() => pushWorkerRpc(config, Redacted.make(config.publishableKey)), /server-only/);
  await assert.rejects(
    Effect.runPromise(
      pushWorkerRpc(config, Redacted.make("sb_secret_invalid"))("claimReceipts", {}),
    ),
  );
  for (const bearer of [undefined, http.bearer, http.otherBearer]) {
    const response = await fetch(`${http.url}/rest/v1/rpc/nest_claim_push_receipt_polls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: "{}",
    });
    assert.ok([401, 403].includes(response.status));
  }
});
