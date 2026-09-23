import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { fixture as groceryFixture } from "../database/grocery-push-fixture.mjs";
import { summaryWorkerFixture } from "./summary-worker-fixture.mjs";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { runPushCycle } from "../../apps/api/src/push/cycle.ts";
import { ApiFailure } from "../../apps/api/src/errors.ts";
test("cycle schedules and delivers all five sources exactly once and settles their receipts", async (t) => {
  const f = await summaryWorkerFixture(t, groceryFixture);
  f.db.sql("delete from private.nest_daily_summary_outbox");
  const messages = [];
  const provider = expoPushTransport(undefined, async (url, input) => {
    if (url.endsWith("/send")) {
      messages.push(JSON.parse(input.body));
      return Response.json({ data: { status: "ok", id: `ticket-${messages.length}` } });
    }
    return Response.json({
      data: {
        "ticket-1": { status: "ok" },
        "ticket-2": { status: "ok" },
        "ticket-3": { status: "ok" },
        "ticket-4": { status: "ok" },
        "ticket-5": { status: "ok" },
      },
    });
  });
  const worker = pushDeliveryWorker(f.baseRpc, provider);
  const first = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(first.groceryMaintenance.status, "recorded");
  assert.equal(first.groceryDelivery.report.outcomes[0].status, "recorded");
  assert.equal(first.summaryMaintenance.status, "recorded");
  assert.equal(first.summaryMaintenance.report.scheduled, 1);
  assert.equal(first.summaryDelivery.report.outcomes[0].status, "recorded");
  assert.equal(messages.length, 5);
  assert.equal(messages.filter((m) => m.data.kind === "daily_summary").length, 1);
  f.db.sql(
    "update private.nest_push_receipt_polls set next_at=clock_timestamp()-interval '1 second'",
  );
  const second = await Effect.runPromise(runPushCycle(f.baseRpc, worker));
  assert.equal(second.receipts.report.scanned, 5);
  assert.equal(messages.length, 5);
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_deliveries where state='accepted'"),
    "5",
  );
  for (const role of ["anon", "authenticated"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select public.nest_maintain_daily_summaries()`),
      /permission denied/,
    );
});
test("grocery maintenance failure preserves other sources and shared receipt reads", async (t) => {
  const f = await summaryWorkerFixture(t, groceryFixture);
  const rpc = (method, input) =>
    method === "groceryMaintain"
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : f.baseRpc(method, input);
  const kinds = [];
  const provider = expoPushTransport(undefined, async (_url, input) => {
    kinds.push(JSON.parse(input.body).data.kind);
    return Response.json({ data: { status: "ok", id: `isolated-${kinds.length}` } });
  });
  const result = await Effect.runPromise(runPushCycle(rpc, pushDeliveryWorker(rpc, provider)));
  assert.equal(result.groceryMaintenance.status, "failed");
  assert.equal(result.groceryDelivery.status, "skipped");
  assert.equal(result.receipts.status, "recorded");
  assert.deepEqual(kinds, ["renewal", "daily_summary", "chore", "meal"]);
});
test("other maintenance failures still permit independently authorized grocery delivery", async (t) => {
  const f = await summaryWorkerFixture(t, groceryFixture);
  const rpc = (method, input) =>
    ["maintain", "summaryMaintain", "choreMaintain", "mealMaintain"].includes(method)
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : f.baseRpc(method, input);
  const kinds = [];
  const provider = expoPushTransport(undefined, async (_url, input) => {
    kinds.push(JSON.parse(input.body).data.kind);
    return Response.json({ data: { status: "ok", id: "grocery-only" } });
  });
  const result = await Effect.runPromise(runPushCycle(rpc, pushDeliveryWorker(rpc, provider)));
  assert.equal(result.groceryDelivery.report.outcomes[0].status, "recorded");
  assert.equal(result.receipts.status, "recorded");
  assert.deepEqual(kinds, ["grocery"]);
});
