import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { fixture as recurringFixture } from "../database/recurring-push-fixture.mjs";
import { recurringPushRpc } from "../../apps/api/src/push/recurring-rpc.ts";
import { summaryWorkerFixture } from "./summary-worker-fixture.mjs";
import { pushDeliveryWorker } from "../../apps/api/src/push/delivery-worker.ts";
import { runCheckpointedPushPage } from "../../apps/api/src/push/checkpoint-runner.ts";
import { expoPushTransport } from "../../apps/api/src/push/expo-transport.ts";
import { id } from "../database/push-delivery-fixture.mjs";

test("lost committed recurring checkpoint resumes the next page after restart and never resends", async (t) => {
  const f = await summaryWorkerFixture(t, recurringFixture);
  f.rpc = recurringPushRpc(f.baseRpc);
  f.db
    .sql(`insert into private.nest_push_devices(installation_id,actor_id,household_id,revision,token)
    select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(10)}',gen_random_uuid(),
      'ExponentPushToken[restart'||n||']' from generate_series(1,100) n`);
  const renewalBefore = await Effect.runPromise(f.baseRpc("readCheckpoint", {}));
  let sends = 0,
    lost = false;
  const provider = expoPushTransport(undefined, async () => {
    sends++;
    return Response.json({ data: { status: "ok", id: "restart-ticket" } });
  });
  const lossy = (method, input) =>
    f.rpc(method, input).pipe(
      Effect.flatMap((value) => {
        if (method === "saveCheckpoint" && !lost) {
          lost = true;
          return Effect.fail(new ApiFailure({ code: "unavailable" }));
        }
        return Effect.succeed(value);
      }),
    );
  await assert.rejects(
    Effect.runPromise(runCheckpointedPushPage(lossy, pushDeliveryWorker(lossy, provider))),
  );
  assert.equal(sends, 0);
  const checkpoint = await Effect.runPromise(f.rpc("readCheckpoint", {}));
  assert.equal(checkpoint.after.installationId, id(100));
  const resumed = await Effect.runPromise(
    runCheckpointedPushPage(f.rpc, pushDeliveryWorker(f.rpc, provider)),
  );
  assert.equal(resumed.scanned, 1);
  assert.equal(resumed.complete, true);
  assert.equal(sends, 1);
  assert.equal((await Effect.runPromise(f.rpc("readCheckpoint", {}))).after, null);
  await Effect.runPromise(runCheckpointedPushPage(f.rpc, pushDeliveryWorker(f.rpc, provider)));
  await Effect.runPromise(runCheckpointedPushPage(f.rpc, pushDeliveryWorker(f.rpc, provider)));
  assert.equal(sends, 1);
  assert.equal(f.db.sql("select count(*) from private.nest_push_delivery_attempts"), "1");
  assert.deepEqual(await Effect.runPromise(f.baseRpc("readCheckpoint", {})), renewalBefore);
});
