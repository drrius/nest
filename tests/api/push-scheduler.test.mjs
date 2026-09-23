import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createPushSchedulerHandler } from "../../apps/api/src/push/scheduler-handler.ts";
const secret = "a".repeat(64);
test("actual scheduler HTTP requires its separate secret and returns aggregate-only results", async (t) => {
  let calls = 0;
  const handler = createPushSchedulerHandler(Redacted.make(secret), () =>
    Effect.sync(() => {
      calls++;
      return {
        maintenance: { status: "recorded", report: {} },
        choreMaintenance: { status: "recorded", report: {} },
        mealMaintenance: { status: "recorded", report: {} },
        choreDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
        mealDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
        summaryMaintenance: { status: "recorded", report: {} },
        summaryDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
        delivery: {
          status: "recorded",
          report: { complete: true, outcomes: [{ deliveryId: "private-id", status: "recorded" }] },
        },
        receipts: { status: "recorded", report: { outcomes: [] } },
      };
    }),
  );
  const server = nodeServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/internal/push/run`;
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${secret}` } })).status, 405);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
        body: "payload",
      })
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    maintenance: "recorded",
    choreMaintenance: "recorded",
    mealMaintenance: "recorded",
    choreDelivery: "recorded",
    mealDelivery: "recorded",
    summaryMaintenance: "recorded",
    summaryDelivery: "recorded",
    delivery: "recorded",
    receipts: "recorded",
    processed: 1,
    polled: 0,
    failed: 0,
    complete: true,
  });
  assert.equal(calls, 1);
});

test("failed cycles and individual failures return finite unavailable responses", async () => {
  const request = () =>
    new Request("http://localhost/internal/push/run", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
  const broken = createPushSchedulerHandler(Redacted.make(secret), () =>
    Effect.fail("sensitive detail"),
  );
  const unavailable = await broken(request());
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "unavailable" });
  const partial = createPushSchedulerHandler(Redacted.make(secret), () =>
    Effect.succeed({
      maintenance: { status: "recorded", report: {} },
      choreMaintenance: { status: "recorded", report: {} },
      mealMaintenance: { status: "recorded", report: {} },
      choreDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
      mealDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
      summaryMaintenance: { status: "recorded", report: {} },
      summaryDelivery: { status: "recorded", report: { complete: true, outcomes: [] } },
      delivery: {
        status: "recorded",
        report: { complete: false, outcomes: [{ deliveryId: "private", status: "failed" }] },
      },
      receipts: { status: "recorded", report: { outcomes: [] } },
    }),
  );
  const response = await partial(request());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.failed, 1);
  assert.equal(body.complete, false);
  assert.ok(!JSON.stringify(body).includes("private"));
});
