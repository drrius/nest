import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { summaryWorkerFixture } from "./summary-worker-fixture.mjs";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { runPushCycle } from "../../apps/api/src/push/cycle.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
test("bounded cycle materializes real reminders, sends once and settles a later receipt", async (t) => {
  const f = await summaryWorkerFixture(t);
  f.db.sql("delete from private.nest_renewal_reminder_outbox");
  f.db.sql("update public.nest_notification_preferences set daily_summary_enabled=false");
  let sends = 0;
  const worker = pushDeliveryWorker(
    f.baseRpc,
    expoPushTransport(undefined, async (url) => {
      if (url.endsWith("/send")) {
        sends++;
        return Response.json({ data: { status: "ok", id: "cycle-ticket" } });
      }
      return Response.json({ data: { "cycle-ticket": { status: "ok" } } });
    }),
  );
  const first = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(first.maintenance.status, "recorded");
  assert.equal(first.delivery.report.outcomes[0].status, "recorded");
  assert.equal(first.receipts.report.scanned, 0);
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const second = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(second.receipts.report.outcomes[0].status, "recorded");
  assert.equal(sends, 1);
  assert.equal(f.db.sql("select state from private.nest_push_deliveries"), "accepted");
});
test("maintenance failure skips new sends but still attempts due receipt reads", async () => {
  const methods = [];
  const rpc = (method) => {
    methods.push(method);
    return method === "maintain"
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : Effect.succeed({ scanned: 0, claims: [] });
  };
  const result = await Effect.runPromise(
    runPushCycle(rpc, { send: () => assert.fail("unexpected send") }),
  );
  assert.deepEqual(methods, ["maintain", "summaryMaintain", "claimReceipts"]);
  assert.equal(result.delivery.status, "skipped");
  assert.equal(result.receipts.status, "recorded");
});
