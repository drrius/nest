import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { fixture, id } from "../database/summary-push-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { runPushReceipts } from "../../apps/api/src/push/receipt-sweep.ts";
test("summary uses the actual server RPC worker, shared receipt polling and privacy-safe provider payload", async (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923005427_native_push_worker_rpc.sql");
  const http = await postgrestFixture(t, [], f.db);
  const rpc = pushWorkerRpc(
    { url: http.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(http.serverKey),
  );
  const messages = [];
  const provider = expoPushTransport(undefined, async (url, input) => {
    if (url.endsWith("/send")) {
      messages.push(JSON.parse(input.body));
      return Response.json({ data: { status: "ok", id: "summary-http-ticket" } });
    }
    return Response.json({ data: { "summary-http-ticket": { status: "ok" } } });
  });
  const worker = pushDeliveryWorker(rpc, provider),
    delivery = f.prepare();
  assert.equal(await Effect.runPromise(worker.send(delivery)), "recorded");
  assert.equal(await Effect.runPromise(worker.send(delivery)), "skipped");
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].data, {
    version: 1,
    kind: "daily_summary",
    householdId: id(10),
    recipientId: id(1),
    summaryId: f.summaryId,
  });
  assert.equal(messages[0].body, "Your daily summary is ready.");
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const receipts = await Effect.runPromise(runPushReceipts(rpc, worker));
  assert.equal(receipts.scanned, 1);
  assert.equal(receipts.outcomes[0].status, "recorded");
  assert.equal(
    f.db.sql(`select state from private.nest_push_deliveries where id='${delivery}'`),
    "accepted",
  );
});
