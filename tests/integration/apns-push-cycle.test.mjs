import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { apnsDeliveryWorker } from "../../apps/api/src/push/apns-delivery-worker.ts";
import { runPushCycle } from "../../apps/api/src/push/cycle.ts";
import { createPushSchedulerHandler } from "../../apps/api/src/push/scheduler-handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { apnsWorkerFixture } from "./apns-worker-fixture.mjs";
import { loadPushCycleSchema } from "./push-cycle-schema.mjs";

const kinds = ["renewal", "daily_summary", "chore", "meal", "grocery", "recurring"];
async function fixture(t) {
  const f = await apnsWorkerFixture(
    t,
    (stream, headers) => {
      stream.respond({ ":status": 200, "apns-id": headers["apns-id"] });
      stream.end();
    },
    loadPushCycleSchema,
  );
  f.db.sql("delete from private.nest_daily_summary_outbox");
  return f;
}

test("actual APNs scheduler dispatches all six authorized sources once, without receipt polling or ledger changes", async (t) => {
  const f = await fixture(t),
    methods = [];
  const financial = f.financialState();
  const rpc = (method, input) => {
    methods.push(method);
    return f.rpc(method, input);
  };
  const worker = apnsDeliveryWorker(rpc, f.provider, "sandbox");
  const secret = "a".repeat(64);
  const server = nodeServer(
    createPushSchedulerHandler(Redacted.make(secret), () => runPushCycle(rpc, worker)),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const invoke = () =>
    fetch(`http://127.0.0.1:${server.address().port}/internal/push/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
  const first = await invoke(),
    report = await first.json();
  assert.equal(first.status, 200);
  assert.equal(report.receipts, "not_applicable");
  assert.equal(report.polled, 0);
  assert.equal(report.processed, 6);
  assert.equal(report.complete, true);
  assert.equal(report.failed, 0);
  assert.deepEqual(
    f.calls.map((call) => call.body.nest.kind),
    kinds,
  );
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_deliveries where state='provider_accepted'"),
    "6",
  );
  assert.equal(f.db.sql("select count(*) from private.nest_push_receipt_polls"), "0");
  assert.ok(!JSON.stringify(report).includes("00000000-"));
  const second = await invoke();
  assert.equal(second.status, 200);
  assert.equal((await second.json()).receipts, "not_applicable");
  assert.equal(f.calls.length, 6);
  assert.equal(methods.includes("claimReceipts"), false);
  assert.equal(methods.includes("begin"), false);
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "6");
  assert.equal(f.financialState(), financial);
});

test("lost committed APNs checkpoints recover after restart without resending any source", async (t) => {
  const f = await fixture(t);
  const financial = f.financialState(),
    lost = new Set();
  const lossy = (method, input) =>
    f.rpc(method, input).pipe(
      Effect.flatMap((value) => {
        if (/savecheckpoint$/i.test(method) && !lost.has(method)) {
          lost.add(method);
          return Effect.fail(new ApiFailure({ code: "unavailable" }));
        }
        return Effect.succeed(value);
      }),
    );
  const first = await Effect.runPromise(
    runPushCycle(lossy, apnsDeliveryWorker(lossy, f.provider, "sandbox")),
  );
  assert.equal(lost.size, 6);
  for (const phase of [
    "delivery",
    "summaryDelivery",
    "choreDelivery",
    "mealDelivery",
    "groceryDelivery",
    "recurringDelivery",
  ])
    assert.equal(first[phase].status, "failed");
  assert.equal(f.calls.length, 6);
  const resumed = await Effect.runPromise(
    runPushCycle(f.rpc, apnsDeliveryWorker(f.rpc, f.provider, "sandbox")),
  );
  for (const [phase, value] of Object.entries(resumed))
    assert.equal(value.status, phase === "receipts" ? "not_applicable" : "recorded");
  assert.equal(f.calls.length, 6);
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "6");
  assert.equal(f.financialState(), financial);
});

test("APNs maintenance failures preserve independent sources and produce honest scheduler failure", async (t) => {
  const f = await fixture(t),
    methods = [];
  const rpc = (method, input) => {
    methods.push(method);
    return method === "recurringMaintain"
      ? Effect.fail(new ApiFailure({ code: "unavailable" }))
      : f.rpc(method, input);
  };
  const worker = apnsDeliveryWorker(rpc, f.provider, "sandbox");
  const handler = createPushSchedulerHandler(Redacted.make("b".repeat(64)), () =>
    runPushCycle(rpc, worker),
  );
  const response = await handler(
    new Request("http://localhost/internal/push/run", {
      method: "POST",
      headers: { authorization: `Bearer ${"b".repeat(64)}` },
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.recurringMaintenance, "failed");
  assert.equal(body.recurringDelivery, "skipped");
  assert.equal(body.receipts, "not_applicable");
  assert.equal(body.complete, false);
  assert.deepEqual(
    f.calls.map((call) => call.body.nest.kind),
    kinds.slice(0, -1),
  );
  assert.equal(methods.includes("claimReceipts"), false);
});

test("wrong-environment APNs worker leaves all sources unclaimed for a correctly configured worker", async (t) => {
  const f = await fixture(t);
  const first = await Effect.runPromise(
    runPushCycle(f.rpc, apnsDeliveryWorker(f.rpc, f.provider, "production")),
  );
  assert.equal(first.receipts.status, "not_applicable");
  assert.equal(f.calls.length, 0);
  assert.equal(f.db.sql("select count(*) from private.nest_apns_delivery_attempts"), "0");
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_deliveries where state='ready'"),
    "6",
  );
  await Effect.runPromise(runPushCycle(f.rpc, apnsDeliveryWorker(f.rpc, f.provider, "sandbox")));
  assert.deepEqual(
    f.calls.map((call) => call.body.nest.kind),
    kinds,
  );
});
