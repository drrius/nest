import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { summaryWorkerFixture } from "./summary-worker-fixture.mjs";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { runPushCycle } from "../../apps/api/src/push/cycle.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
test("cycle schedules and delivers both sources exactly once and settles their receipts", async (t) => {
  const f = await summaryWorkerFixture(t);
  f.db.sql("delete from private.nest_daily_summary_outbox");
  const messages = [];
  const provider = expoPushTransport(undefined, async (url, input) => {
    if (url.endsWith("/send")) {
      messages.push(JSON.parse(input.body));
      return Response.json({ data: { status: "ok", id: `ticket-${messages.length}` } });
    }
    return Response.json({ data: { "ticket-1": { status: "ok" }, "ticket-2": { status: "ok" } } });
  });
  const worker = pushDeliveryWorker(f.baseRpc, provider);
  const first = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(first.summaryMaintenance.status, "recorded");
  assert.equal(first.summaryMaintenance.report.scheduled, 1);
  assert.equal(first.summaryDelivery.report.outcomes[0].status, "recorded");
  assert.equal(messages.length, 2);
  assert.equal(messages.filter((m) => m.data.kind === "daily_summary").length, 1);
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const second = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(second.receipts.report.scanned, 2);
  assert.equal(messages.length, 2);
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_deliveries where state='accepted'"),
    "2",
  );
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_maintain_daily_summaries()`),
      /permission denied/,
    );
});
test("renewal maintenance failure does not block independently authorized summaries", async (t) => {
  const f = await summaryWorkerFixture(t);
  const rpc = (method, input) =>
    method === "maintain"
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : f.baseRpc(method, input);
  let sends = 0;
  const provider = expoPushTransport(undefined, async () => {
    sends++;
    return Response.json({ data: { status: "ok", id: "isolated-summary" } });
  });
  const result = await Effect.runPromise(runPushCycle(rpc, pushDeliveryWorker(rpc, provider)));
  assert.equal(result.delivery.status, "skipped");
  assert.equal(result.summaryDelivery.report.outcomes[0].status, "recorded");
  assert.equal(result.receipts.status, "recorded");
  assert.equal(sends, 1);
});
test("summary maintenance failure does not block renewals or shared receipt reads", async (t) => {
  const f = await summaryWorkerFixture(t);
  const rpc = (method, input) =>
    method === "summaryMaintain"
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : f.baseRpc(method, input);
  let sends = 0;
  const provider = expoPushTransport(undefined, async () => {
    sends++;
    return Response.json({ data: { status: "ok", id: "isolated-renewal" } });
  });
  const result = await Effect.runPromise(runPushCycle(rpc, pushDeliveryWorker(rpc, provider)));
  assert.equal(result.delivery.report.outcomes[0].status, "recorded");
  assert.equal(result.summaryDelivery.status, "skipped");
  assert.equal(result.receipts.status, "recorded");
  assert.equal(sends, 1);
});
